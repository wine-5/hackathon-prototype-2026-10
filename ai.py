"""Gemini API との連携（記事・問題の生成、要約の採点、単語の意味、ニュース動画からの問題作成）

GEMINI_API_KEY が未設定、または呼び出しに失敗した場合は None を返し、
呼び出し側で初期データや簡易採点に切り替える。
"""
import json
import logging
import os
import random

import requests

log = logging.getLogger(__name__)

API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"


def enabled():
    return bool(os.environ.get("GEMINI_API_KEY"))


def model_name():
    return os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")


# 文体の指定。生成文が「いかにもAI」に見えないよう、避ける表現を具体的に挙げる
STYLE_JA = """日本語は次のルールで書くこと。
- です・ます調で、短く具体的に書く。1文は60字以内を目安にする。
- 絵文字・顔文字は使わない。「！」も使わない。
- 「素晴らしい」「完璧」「ぜひ」「〜しましょう」「〜してみてください」「頑張りましょう」などの励ましや決まり文句は書かない。
- 前置き、まとめ、あいさつ、感想は書かない。
- 元の文章にない情報は付け足さない。"""

STYLE_EN = """Write plain, concrete English, like a well-edited school textbook or a news agency.
- Do not use these words or phrases: nestled, vibrant, bustling, tapestry, testament, delve, boasts, must-see,
  hidden gem, embark, breathtaking, rich history, steeped in, iconic, renowned, captivating, mesmerizing, in conclusion.
- No exclamation marks and no rhetorical questions.
- Use only facts found in the source text. Do not invent numbers, dates or names."""

LEVEL_GUIDE = {
    "A2": "CEFR A2: short sentences, common everyday words, about 110-140 words in total.",
    "B1": "CEFR B1: clear sentences with some linking words, about 150-190 words in total.",
    "B2": "CEFR B2: natural sentences with some less common words, about 200-240 words in total.",
}

QUESTION_SCHEMA = {
    "type": "object",
    "properties": {
        "q": {"type": "string"},
        "choices": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4},
        "answer": {"type": "integer"},
        "hint": {"type": "string"},
        "explain": {"type": "string"},
    },
    "required": ["q", "choices", "answer", "hint", "explain"],
}


# ---------- 低レベル呼び出し ----------

def _to_openapi(schema):
    """JSON Schema を responseSchema（OpenAPI 形式）に変換する。古い API 向けのフォールバック"""
    if isinstance(schema, dict):
        out = {}
        for k, v in schema.items():
            if k in ("minItems", "maxItems"):
                out[k] = str(v)
            elif k == "type":
                out[k] = v.upper()
            else:
                out[k] = _to_openapi(v)
        return out
    if isinstance(schema, list):
        return [_to_openapi(x) for x in schema]
    return schema


def _post(body):
    r = requests.post(
        f"{API_ROOT}/{model_name()}:generateContent",
        headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"], "Content-Type": "application/json"},
        json=body,
        timeout=120,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Gemini {r.status_code}: {r.text[:300]}")
    data = r.json()
    parts = data["candidates"][0]["content"]["parts"]
    return "".join(p.get("text", "") for p in parts if not p.get("thought"))


def generate_json(prompt, schema, *, system=None, media=None, temperature=0.6):
    """構造化出力で JSON を返す。失敗したら None"""
    if not enabled():
        return None
    parts = list(media or []) + [{"text": prompt}]
    base = {"contents": [{"role": "user", "parts": parts}]}
    if system:
        base["systemInstruction"] = {"parts": [{"text": system}]}
    attempts = [
        {"responseMimeType": "application/json", "responseJsonSchema": schema, "temperature": temperature},
        {"responseMimeType": "application/json", "responseSchema": _to_openapi(schema), "temperature": temperature},
    ]
    for config in attempts:
        try:
            text = _post({**base, "generationConfig": config})
            return json.loads(text)
        except Exception as e:  # noqa: BLE001 - 失敗理由はログに残して次を試す
            log.warning("Gemini call failed: %s", e)
    return None


def _clean_questions(qs):
    """形式をチェックし、正解の位置をばらけさせる"""
    out = []
    for q in qs or []:
        choices = [str(c).strip() for c in q.get("choices", [])]
        ans = q.get("answer")
        if len(choices) != 4 or not isinstance(ans, int) or not 0 <= ans < 4 or not q.get("q"):
            return None
        correct = choices[ans]
        random.shuffle(choices)
        out.append({"q": q["q"].strip(), "choices": choices, "answer": choices.index(correct),
                    "hint": q.get("hint", "").strip(), "explain": q.get("explain", "").strip()})
    return out if len(out) == 3 else None


# ---------- 記事と問題 ----------

LESSON_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "paragraphs": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 4},
        "questions": {"type": "array", "items": QUESTION_SCHEMA, "minItems": 3, "maxItems": 3},
        "keywords": {
            "type": "array",
            "items": {"type": "object", "properties": {"en": {"type": "string"}, "ja": {"type": "string"}},
                      "required": ["en", "ja"]},
            "minItems": 4, "maxItems": 6,
        },
        "model_summary": {"type": "string"},
        "glossary": {
            "type": "array",
            "items": {"type": "object",
                      "properties": {"word": {"type": "string"}, "pos": {"type": "string"},
                                     "meaning": {"type": "string"}},
                      "required": ["word", "pos", "meaning"]},
            "maxItems": 12,
        },
    },
    "required": ["title", "paragraphs", "questions", "keywords", "model_summary", "glossary"],
}


def generate_lesson(trip, country, level, source_text):
    prompt = f"""You are making a reading lesson for Japanese learners of English who want to travel to {country['name_en']}.
Topic: {trip['name_en']} ({trip['category']} / {trip['city']}).
Level: {LEVEL_GUIDE.get(level, LEVEL_GUIDE['B1'])}

Using only the Wikipedia text below, write:
1. title: a short English headline (no colon-heavy clickbait).
2. paragraphs: 2-4 paragraphs in English for this level. Include what a traveler would find useful (what it is, history in brief, what people do there).
3. questions: exactly 3 multiple-choice questions in English about the article. 4 choices each, one correct answer, wrong choices must be clearly wrong when you read the text. "answer" is the 0-based index.
   "hint" (Japanese) points to where in the article to look, quoting a few English words. "explain" (Japanese) says why the answer is correct, quoting the article.
4. keywords: 4-6 key points a good summary should mention. "en" is the English word, "ja" the Japanese word.
5. model_summary: a 1-2 sentence English summary of the article.
6. glossary: up to 12 words from the article that a {level} learner may not know. "word" is the form used in the text (lowercase), "pos" is one of 名/動/形/副, "meaning" is a short Japanese meaning fitting the context.

{STYLE_EN}
{STYLE_JA}

Wikipedia text:
\"\"\"{source_text[:6000]}\"\"\""""
    data = generate_json(prompt, LESSON_SCHEMA)
    if not data:
        return None
    questions = _clean_questions(data.get("questions"))
    paragraphs = [p.strip() for p in data.get("paragraphs", []) if p.strip()]
    if not questions or len(paragraphs) < 2:
        return None
    return {
        "article": {"title": data["title"].strip(), "paragraphs": paragraphs},
        "questions": questions,
        "summary": {"keywords": [[k["en"], k["ja"]] for k in data.get("keywords", [])],
                    "model": data["model_summary"].strip()},
        "glossary": [g for g in data.get("glossary", []) if g.get("word") and g.get("meaning")],
    }


# ---------- 要約の採点 ----------

GRADE_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer"},
        "good": {"type": "array", "items": {"type": "string"}, "maxItems": 2},
        "improve": {"type": "array", "items": {"type": "string"}, "maxItems": 2},
        "rewrite": {"type": "string"},
    },
    "required": ["score", "good", "improve", "rewrite"],
}


def grade_summary(article_text, summary, lang, level):
    lang_label = "English" if lang == "en" else "Japanese"
    prompt = f"""A Japanese learner of English (level {level}) read the article below and wrote a summary in {lang_label}.
Grade the summary.

- score: 0-100. Judge mainly whether the main points of the article are included and correct. If written in English, also judge grammar and word choice for a {level} learner. Do not give 100 unless it is close to a native-level summary.
- good: 0-2 short points that are actually good (Japanese). Leave empty if there is nothing specific.
- improve: 1-2 concrete things to fix or add (Japanese). Quote the learner's words when pointing out a mistake.
- rewrite: one improved English version of the learner's summary, keeping their ideas, 1-2 sentences.

{STYLE_JA}

Article:
\"\"\"{article_text}\"\"\"

Learner's summary:
\"\"\"{summary}\"\"\""""
    data = generate_json(prompt, GRADE_SCHEMA, temperature=0.2)
    if not data or not isinstance(data.get("score"), int):
        return None
    data["score"] = max(0, min(100, data["score"]))
    return data


# ---------- 単語の意味 ----------

WORD_SCHEMA = {
    "type": "object",
    "properties": {"pos": {"type": "string"}, "meaning": {"type": "string"}, "base": {"type": "string"}},
    "required": ["pos", "meaning", "base"],
}


def lookup_word(word, context):
    prompt = f"""Give the meaning of the English word "{word}" as used in this sentence, for a Japanese learner.
Sentence: "{context[:400]}"

- base: dictionary form of the word (lowercase).
- pos: one of 名/動/形/副/前/接/その他.
- meaning: short Japanese meaning that fits the sentence (under 25 characters). If it is a proper noun, explain what it is in under 25 characters.
{STYLE_JA}"""
    data = generate_json(prompt, WORD_SCHEMA, temperature=0.1)
    if not data or not data.get("meaning"):
        return None
    return data


# ---------- ニュース動画から問題を作る ----------

NEWS_SCHEMA = {
    "type": "object",
    "properties": {
        "usable": {"type": "boolean"},
        "headline": {"type": "string"},
        "script": {"type": "string"},
        "summaryJa": {"type": "string"},
        "summaryEn": {"type": "string"},
        "questions": {"type": "array", "items": QUESTION_SCHEMA, "minItems": 3, "maxItems": 3},
    },
    "required": ["usable", "headline", "script", "summaryJa", "summaryEn", "questions"],
}


def news_from_video(video_url, title, country_name_en):
    prompt = f"""This is a news video related to {country_name_en}. YouTube title: "{title}".
Make a listening exercise for Japanese learners of English (around CEFR B1).

- usable: false if the video is not mainly spoken English news, or if you cannot hear the speech. Otherwise true.
- headline: short English headline of the story.
- script: the main spoken English from the video, as close to the actual words as possible, 60-150 words. Do not add sentences that are not spoken.
- summaryJa: 2-3 sentence Japanese summary.
- summaryEn: 1-2 sentence English summary.
- questions: exactly 3 English multiple-choice questions that can be answered by listening. 4 choices, one correct, "answer" is the 0-based index. "hint" (Japanese) tells which part to listen for. "explain" (Japanese) quotes what was said.

{STYLE_EN}
{STYLE_JA}"""
    data = generate_json(prompt, NEWS_SCHEMA, media=[{"file_data": {"file_uri": video_url}}], temperature=0.3)
    if not data or not data.get("usable"):
        return None
    questions = _clean_questions(data.get("questions"))
    if not questions or not data.get("script"):
        return None
    return {"headline": data["headline"].strip(), "script": data["script"].strip(),
            "summaryJa": data["summaryJa"].strip(), "summaryEn": data["summaryEn"].strip(),
            "questions": questions}
