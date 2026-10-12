"""TabiYomi - 行きたい国の観光地や文化、ニュースで英語を学ぶアプリ

起動: python app.py  →  http://127.0.0.1:5000
"""
import json
import logging
import os
import re
import secrets
from datetime import date, timedelta
from functools import wraps

import requests
from dotenv import load_dotenv
from flask import Flask, abort, jsonify, redirect, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import ai
import sources
from db import BASE_DIR, close_db, execute, init_db, query

load_dotenv(BASE_DIR / ".env")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

LEVELS = ("A2", "B1", "B2")
STAMP_RATE = 0.6  # この正答率以上でスタンプ


def _secret_key():
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    path = BASE_DIR / "instance" / "secret_key"
    if not path.exists():
        path.write_text(secrets.token_hex(32), encoding="utf-8")
    return path.read_text(encoding="utf-8").strip()


def create_app(test_config=None):
    (BASE_DIR / "instance").mkdir(exist_ok=True)
    app = Flask(__name__, instance_path=str(BASE_DIR / "instance"))
    app.config.update(
        SECRET_KEY=_secret_key(),
        DATABASE=str(BASE_DIR / "instance" / "tabiyomi.db"),
        JSON_AS_ASCII=False,
        SESSION_COOKIE_SAMESITE="Lax",
        PERMANENT_SESSION_LIFETIME=timedelta(days=30),
    )
    if test_config:
        app.config.update(test_config)
    app.json.ensure_ascii = False
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()
    register_routes(app)
    return app


# ---------- 共通 ----------

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "uid" not in session:
            return jsonify(error="ログインしてください"), 401
        return fn(*args, **kwargs)
    return wrapper


def bad(msg, code=400):
    return jsonify(error=msg), code


def current_user():
    return query("SELECT id, username, display_name, level FROM users WHERE id = ?", (session["uid"],), one=True)


def country_dict(c, trips=None):
    d = {"id": c["id"], "name": c["country_name"], "nameEn": c["name_en"], "code": c["code"],
         "region": c["region"], "lat": c["lat"], "lng": c["lng"], "color": c["color"],
         "capital": c["capital"], "language": c["language"], "currency": c["currency"],
         "phrase": {"local": c["phrase_local"], "ja": c["phrase_ja"]}, "desc": c["description"],
         "tourOrder": c["tour_order"]}
    if trips is not None:
        d["trips"] = [trip_dict(t) for t in trips]
    return d


def trip_dict(t):
    return {"id": t["id"], "name": t["trip_name"], "nameEn": t["name_en"], "wiki": t["wiki_page_title"],
            "img": t["image_key"] or t["wiki_page_title"], "category": t["category"], "city": t["city"],
            "tip": t["tip"], "desc": t["description"], "level": t["level"], "minutes": t["minutes"],
            "countryId": t["country_id"]}


def streak_days(uid):
    days = {date.fromisoformat(r["d"]) for r in
            query("SELECT DISTINCT date(created_at) AS d FROM history WHERE user_id = ?", (uid,))}
    day = date.today()
    if day not in days:
        day -= timedelta(days=1)
    n = 0
    while day in days:
        n += 1
        day -= timedelta(days=1)
    return n


def public_questions(qs):
    """答えと解説は採点まで送らない"""
    return [{"q": q["q"], "choices": q["choices"], "hint": q.get("hint", "")} for q in qs]


WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’-]*")


def word_candidates(word):
    w = word.lower().replace("’", "'")
    w = re.sub(r"'s$", "", w)
    cands = [w]
    for suf, rep in (("ies", "y"), ("es", ""), ("s", ""), ("ed", ""), ("ed", "e"), ("d", ""), ("ing", ""), ("ing", "e")):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            cands.append(w[: -len(suf)] + rep)
    return list(dict.fromkeys(cands))


def glossary_words_in(texts):
    """本文中で辞書に載っている単語（ハイライト用）"""
    found = set()
    words = {w for t in texts for w in WORD_RE.findall(t)}
    rows = {r["word"] for r in query("SELECT word FROM glossary")}
    for w in words:
        if any(c in rows for c in word_candidates(w)):
            found.add(w.lower())
    return sorted(found)


def keyword_grade(text, summary):
    """Gemini が使えないときの要約採点（キーワードがどれだけ入っているか）"""
    t = text.lower()
    hit, miss = [], []
    for alts in summary["keywords"]:
        (hit if any(a.lower() in t for a in alts) else miss).append(alts[0])
    is_ja = bool(re.search(r"[぀-ヿ一-龯]", text))
    length = len(text.strip())
    score = round(len(hit) / max(1, len(summary["keywords"])) * 80)
    if length >= (30 if is_ja else 60):
        score += 20
    elif length >= (15 if is_ja else 30):
        score += 10
    improve = []
    if miss:
        improve.append("「" + "」「".join(miss[:3]) + "」にあたる内容が入っていません。")
    if is_ja:
        improve.append("内容はつかめています。次は英語で書いてみてください。")
    elif length < 60:
        improve.append("1文だけだと情報が足りません。2文くらいにまとめると要点が伝わります。")
    return {"score": min(100, score), "good": [], "improve": improve, "rewrite": "", "hit": hit, "miss": miss}


def record_result(uid, kind, ref_id, country_id, title, correct, total, summary_score=None):
    execute("""INSERT INTO history (user_id, kind, ref_id, country_id, title, correct, total, summary_score)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (uid, kind, ref_id, country_id, title, correct, total, summary_score))
    stamp_new = False
    if correct / total >= STAMP_RATE:
        cur = execute("INSERT OR IGNORE INTO stamps (user_id, country_id) VALUES (?, ?)", (uid, country_id))
        stamp_new = cur.rowcount == 1
    stamp = query("SELECT earned_at FROM stamps WHERE user_id = ? AND country_id = ?", (uid, country_id), one=True)
    return {"new": stamp_new, "date": stamp["earned_at"] if stamp else None}


def check_answers(qs, answers):
    results, correct = [], 0
    for i, q in enumerate(qs):
        a = answers[i] if i < len(answers) else None
        ok = a == q["answer"]
        correct += ok
        results.append({"ok": ok, "answer": q["answer"], "chosen": a, "explain": q.get("explain", "")})
    return correct, results


# ---------- ルーティング ----------

def register_routes(app):

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/manifest.webmanifest")
    def manifest():
        return app.send_static_file("manifest.webmanifest")

    @app.get("/api/status")
    def status():
        return jsonify(gemini=ai.enabled(), youtube=sources.youtube_enabled(), model=ai.model_name())

    # --- 認証 ---

    @app.post("/api/signup")
    def signup():
        d = request.get_json(silent=True) or {}
        username = (d.get("username") or "").strip()
        password = d.get("password") or ""
        name = (d.get("displayName") or "").strip() or username
        level = d.get("level") if d.get("level") in LEVELS else "B1"
        if not re.fullmatch(r"[A-Za-z0-9_]{3,20}", username):
            return bad("ユーザー名は半角英数字と _ で3〜20文字にしてください")
        if len(password) < 6:
            return bad("パスワードは6文字以上にしてください")
        if query("SELECT 1 FROM users WHERE username = ?", (username,), one=True):
            return bad("このユーザー名はすでに使われています")
        cur = execute("INSERT INTO users (username, password_hash, display_name, level) VALUES (?, ?, ?, ?)",
                      (username, generate_password_hash(password), name[:16], level))
        session.clear()
        session.permanent = True
        session["uid"] = cur.lastrowid
        return jsonify(ok=True)

    @app.post("/api/login")
    def login():
        d = request.get_json(silent=True) or {}
        row = query("SELECT id, password_hash FROM users WHERE username = ?", ((d.get("username") or "").strip(),), one=True)
        if not row or not check_password_hash(row["password_hash"], d.get("password") or ""):
            return bad("ユーザー名かパスワードが違います", 401)
        session.clear()
        session.permanent = True
        session["uid"] = row["id"]
        return jsonify(ok=True)

    @app.post("/api/logout")
    def logout():
        session.clear()
        return jsonify(ok=True)

    # --- ユーザー情報 ---

    @app.get("/api/me")
    @login_required
    def me():
        u = current_user()
        if not u:
            session.clear()
            return bad("ログインしてください", 401)
        uid = u["id"]
        stamps = {r["country_id"]: r["earned_at"] for r in query("SELECT country_id, earned_at FROM stamps WHERE user_id = ?", (uid,))}
        wants = [r["trip_id"] for r in query("SELECT trip_id FROM wants WHERE user_id = ? ORDER BY created_at DESC", (uid,))]
        history = [dict(r) for r in query(
            """SELECT kind, ref_id AS id, country_id AS country, title, correct, total, summary_score, created_at AS at
               FROM history WHERE user_id = ? ORDER BY id DESC LIMIT 50""", (uid,))]
        words = query("SELECT COUNT(*) AS n FROM saved_words WHERE user_id = ?", (uid,), one=True)["n"]
        return jsonify(user={"name": u["display_name"], "username": u["username"], "level": u["level"]},
                       stamps=stamps, wants=wants, history=history, wordCount=words, streak=streak_days(uid))

    @app.patch("/api/me")
    @login_required
    def update_me():
        d = request.get_json(silent=True) or {}
        if d.get("level") in LEVELS:
            execute("UPDATE users SET level = ? WHERE id = ?", (d["level"], session["uid"]))
        if (d.get("displayName") or "").strip():
            execute("UPDATE users SET display_name = ? WHERE id = ?", (d["displayName"].strip()[:16], session["uid"]))
        return jsonify(ok=True)

    @app.delete("/api/me/progress")
    @login_required
    def reset_progress():
        for table in ("stamps", "history", "saved_words", "wants"):
            execute(f"DELETE FROM {table} WHERE user_id = ?", (session["uid"],))
        return jsonify(ok=True)

    # --- 国・観光地 ---

    @app.get("/api/countries")
    @login_required
    def countries():
        trips = query("SELECT * FROM trips ORDER BY sort_order")
        by_country = {}
        for t in trips:
            by_country.setdefault(t["country_id"], []).append(t)
        rows = query("SELECT * FROM countries ORDER BY tour_order")
        return jsonify([country_dict(c, by_country.get(c["id"], [])) for c in rows])

    @app.get("/api/countries/<cid>/info")
    @login_required
    def country_info(cid):
        c = query("SELECT * FROM countries WHERE id = ?", (cid,), one=True) or abort(404)
        s = sources.wiki_summary("ja", c["wiki_ja"])
        return jsonify(extract=s.get("extract") or c["description"], url=s.get("url"))

    @app.get("/api/image")
    def image():
        key = request.args.get("key", "")
        if not key or len(key) > 120:
            abort(404)
        url = sources.wiki_image(key, large=request.args.get("lg") == "1")
        if not url:
            abort(404)
        resp = redirect(url)
        resp.headers["Cache-Control"] = "public, max-age=86400"
        return resp

    @app.post("/api/wants/<trip_id>")
    @login_required
    def toggle_want(trip_id):
        query("SELECT 1 FROM trips WHERE id = ?", (trip_id,), one=True) or abort(404)
        uid = session["uid"]
        if query("SELECT 1 FROM wants WHERE user_id = ? AND trip_id = ?", (uid, trip_id), one=True):
            execute("DELETE FROM wants WHERE user_id = ? AND trip_id = ?", (uid, trip_id))
            return jsonify(wanted=False)
        execute("INSERT INTO wants (user_id, trip_id) VALUES (?, ?)", (uid, trip_id))
        return jsonify(wanted=True)

    # --- リーディング ---

    @app.get("/api/trips/<trip_id>/lesson")
    @login_required
    def lesson(trip_id):
        t = query("SELECT * FROM trips WHERE id = ?", (trip_id,), one=True) or abort(404)
        level = current_user()["level"]
        want_new = request.args.get("new") == "1"
        row = None
        if not want_new:
            row = query("""SELECT * FROM lessons WHERE trip_id = ? AND level = ? AND source = 'gemini'
                           ORDER BY id DESC LIMIT 1""", (trip_id, level), one=True)
        if not row and ai.enabled():
            row = make_ai_lesson(t, level)
        if not row:
            row = query("SELECT * FROM lessons WHERE trip_id = ? AND source = 'seed' ORDER BY id DESC LIMIT 1",
                        (trip_id,), one=True)
        p = json.loads(row["payload"])
        return jsonify(id=row["id"], source=row["source"], level=row["level"], article=p["article"],
                       questions=public_questions(p["questions"]),
                       keywords=glossary_words_in(p["article"]["paragraphs"]),
                       canRegenerate=ai.enabled())

    def make_ai_lesson(t, level):
        c = query("SELECT * FROM countries WHERE id = ?", (t["country_id"],), one=True)
        text = sources.wiki_text(t["wiki_page_title"])
        if len(text) < 400:
            return None
        trip = {"name_en": t["name_en"], "category": "sightseeing spot" if t["category"] == "sight" else "culture",
                "city": t["city"]}
        p = ai.generate_lesson(trip, {"name_en": c["name_en"]}, level, text)
        if not p:
            return None
        for g in p.pop("glossary", []):
            execute("INSERT OR IGNORE INTO glossary (word, pos, meaning, source) VALUES (?, ?, ?, 'gemini')",
                    (g["word"].lower().strip(), g.get("pos"), g["meaning"].strip()))
        cur = execute("INSERT INTO lessons (trip_id, level, source, payload) VALUES (?, ?, 'gemini', ?)",
                      (t["id"], level, json.dumps(p, ensure_ascii=False)))
        return query("SELECT * FROM lessons WHERE id = ?", (cur.lastrowid,), one=True)

    @app.post("/api/lessons/<int:lesson_id>/grade")
    @login_required
    def grade_lesson(lesson_id):
        row = query("SELECT * FROM lessons WHERE id = ?", (lesson_id,), one=True) or abort(404)
        t = query("SELECT * FROM trips WHERE id = ?", (row["trip_id"],), one=True)
        p = json.loads(row["payload"])
        d = request.get_json(silent=True) or {}
        answers = d.get("answers") or []
        summary_text = (d.get("summary") or "").strip()[:1500]
        lang = "ja" if d.get("lang") == "ja" else "en"
        correct, results = check_answers(p["questions"], answers)

        summary = None
        if summary_text:
            article_text = "\n".join(p["article"]["paragraphs"])
            graded = ai.grade_summary(article_text, summary_text, lang, current_user()["level"])
            if graded:
                summary = {**graded, "by": "ai", "hit": [], "miss": []}
            else:
                summary = {**keyword_grade(summary_text, p["summary"]), "by": "basic"}
            summary["model"] = p["summary"]["model"]

        stamp = record_result(session["uid"], "read", t["id"], t["country_id"], t["trip_name"],
                              correct, len(p["questions"]), summary["score"] if summary else None)
        return jsonify(correct=correct, total=len(p["questions"]), results=results, summary=summary, stamp=stamp)

    # --- リスニング ---

    @app.get("/api/countries/<cid>/news")
    @login_required
    def news(cid):
        c = query("SELECT * FROM countries WHERE id = ?", (cid,), one=True) or abort(404)
        want_new = request.args.get("new") == "1"
        row = None
        if sources.youtube_enabled() and ai.enabled():
            if not want_new:
                row = query("""SELECT * FROM news WHERE country_id = ? AND source = 'youtube'
                               AND created_at > datetime('now', '-3 days') ORDER BY id DESC LIMIT 1""", (cid,), one=True)
            if not row:
                row = make_video_news(c)
        if not row:
            row = query("SELECT * FROM news WHERE country_id = ? AND source = 'seed' ORDER BY id DESC LIMIT 1",
                        (cid,), one=True)
        p = json.loads(row["payload"])
        return jsonify(id=row["id"], source=row["source"], video=p.get("video"), headline=p["headline"],
                       script=p["script"], summaryJa=p["summaryJa"], summaryEn=p["summaryEn"],
                       questions=public_questions(p["questions"]), keywords=glossary_words_in([p["script"]]),
                       canRegenerate=sources.youtube_enabled() and ai.enabled())

    def make_video_news(c):
        used = {r["video_id"] for r in query("SELECT video_id FROM news WHERE country_id = ? AND video_id IS NOT NULL", (c["id"],))}
        for v in [v for v in sources.youtube_news_candidates(c["name_en"]) if v["id"] not in used][:3]:
            p = ai.news_from_video(f"https://www.youtube.com/watch?v={v['id']}", v["title"], c["name_en"])
            if p:
                p["video"] = v
                cur = execute("INSERT INTO news (country_id, source, video_id, payload) VALUES (?, 'youtube', ?, ?)",
                              (c["id"], v["id"], json.dumps(p, ensure_ascii=False)))
                return query("SELECT * FROM news WHERE id = ?", (cur.lastrowid,), one=True)
        return None

    @app.post("/api/news/<int:news_id>/grade")
    @login_required
    def grade_news(news_id):
        row = query("SELECT * FROM news WHERE id = ?", (news_id,), one=True) or abort(404)
        p = json.loads(row["payload"])
        correct, results = check_answers(p["questions"], (request.get_json(silent=True) or {}).get("answers") or [])
        stamp = record_result(session["uid"], "listen", row["country_id"], row["country_id"], p["headline"],
                              correct, len(p["questions"]))
        return jsonify(correct=correct, total=len(p["questions"]), results=results, stamp=stamp)

    # --- 単語 ---

    @app.get("/api/lookup")
    @login_required
    def lookup():
        word = (request.args.get("w") or "").strip()[:40]
        context = (request.args.get("context") or "")[:400]
        if not WORD_RE.fullmatch(word):
            return bad("単語を指定してください")
        for cand in word_candidates(word):
            g = query("SELECT word, pos, meaning FROM glossary WHERE word = ?", (cand,), one=True)
            if g:
                return jsonify(word=g["word"], pos=g["pos"], meaning=g["meaning"], lang="ja")
        res = ai.lookup_word(word, context) if ai.enabled() else None
        if res:
            base = (res.get("base") or word).lower()
            execute("INSERT OR IGNORE INTO glossary (word, pos, meaning, source) VALUES (?, ?, ?, 'gemini')",
                    (base, res["pos"], res["meaning"]))
            return jsonify(word=base, pos=res["pos"], meaning=res["meaning"], lang="ja")
        # 最後の手段: 無料の英英辞書
        try:
            r = requests.get(f"https://api.dictionaryapi.dev/api/v2/entries/en/{requests.utils.quote(word.lower())}",
                             timeout=8)
            if r.ok:
                m = r.json()[0]["meanings"][0]
                pos = {"noun": "名", "verb": "動", "adjective": "形", "adverb": "副"}.get(m["partOfSpeech"], "")
                return jsonify(word=word.lower(), pos=pos, meaning=m["definitions"][0]["definition"], lang="en")
        except Exception:  # noqa: BLE001
            pass
        return jsonify(word=word.lower(), pos="", meaning="", lang="")

    @app.get("/api/words")
    @login_required
    def words():
        rows = query("SELECT word, pos, meaning, source FROM saved_words WHERE user_id = ? ORDER BY created_at DESC",
                     (session["uid"],))
        return jsonify([dict(r) for r in rows])

    @app.post("/api/words")
    @login_required
    def add_word():
        d = request.get_json(silent=True) or {}
        word = (d.get("word") or "").strip().lower()[:40]
        meaning = (d.get("meaning") or "").strip()[:200]
        if not word or not meaning:
            return bad("単語と意味が必要です")
        execute("""INSERT OR REPLACE INTO saved_words (user_id, word, pos, meaning, source)
                   VALUES (?, ?, ?, ?, ?)""", (session["uid"], word, d.get("pos"), meaning, (d.get("source") or "")[:60]))
        return jsonify(ok=True)

    @app.delete("/api/words/<word>")
    @login_required
    def delete_word(word):
        execute("DELETE FROM saved_words WHERE user_id = ? AND word = ?", (session["uid"], word.lower()))
        return jsonify(ok=True)


app = create_app()

if __name__ == "__main__":
    # スマホから同じ Wi-Fi で開くときは HOST=0.0.0.0 を指定する
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "5000")),
            debug=os.environ.get("FLASK_DEBUG") == "1")
