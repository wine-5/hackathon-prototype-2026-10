"""外部データの取得（Wikipedia / YouTube Data API）。結果は cache テーブルに保存する"""
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone

import requests

from db import execute, query

log = logging.getLogger(__name__)

# Wikimedia の利用規約に従い、連絡先のわかる User-Agent を付ける
HEADERS = {"User-Agent": "TabiYomi/0.1 (hackathon prototype; contact via repository owner)"}


def _cached(key, max_age_hours, fetch):
    row = query("SELECT value, fetched_at FROM cache WHERE key = ?", (key,), one=True)
    if row:
        fetched = datetime.fromisoformat(row["fetched_at"]).replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - fetched < timedelta(hours=max_age_hours):
            return json.loads(row["value"])
    try:
        value = fetch()
    except Exception as e:  # noqa: BLE001 - 外部APIの失敗は古いキャッシュで補う
        log.warning("fetch failed for %s: %s", key, e)
        return json.loads(row["value"]) if row else None
    if value is not None:
        execute("INSERT OR REPLACE INTO cache (key, value, fetched_at) VALUES (?, ?, datetime('now'))",
                (key, json.dumps(value, ensure_ascii=False)))
    return value


# ---------- Wikipedia ----------

def wiki_summary(lang, title):
    """ページ概要（冒頭の説明文と代表画像）"""
    def fetch():
        r = requests.get(f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{requests.utils.quote(title)}",
                         headers=HEADERS, timeout=15)
        if r.status_code == 404:
            return {}
        r.raise_for_status()
        d = r.json()
        thumb = (d.get("thumbnail") or {}).get("source")
        return {"title": d.get("title"), "extract": d.get("extract", ""), "thumb": thumb,
                "url": (d.get("content_urls") or {}).get("desktop", {}).get("page")}
    return _cached(f"wiki-summary:{lang}:{title}", 24 * 7, fetch) or {}


def wiki_image(key, large=False):
    """"fr:Tour_Eiffel" のように言語を指定できる。省略時は英語版"""
    m = re.match(r"^([a-z]{2}):(.+)$", key)
    lang, title = (m.group(1), m.group(2)) if m else ("en", key)
    thumb = wiki_summary(lang, title).get("thumb")
    if thumb and large:
        thumb = re.sub(r"/\d+px-", "/960px-", thumb)
    return thumb


def wiki_text(title, lang="en"):
    """記事本文のプレーンテキスト（先頭から最大 8000 文字）"""
    def fetch():
        r = requests.get(f"https://{lang}.wikipedia.org/w/api.php", headers=HEADERS, timeout=20, params={
            "action": "query", "prop": "extracts", "explaintext": 1, "exsectionformat": "plain",
            "redirects": 1, "titles": title, "format": "json", "formatversion": 2,
        })
        r.raise_for_status()
        pages = r.json()["query"]["pages"]
        text = pages[0].get("extract", "") if pages else ""
        # 参考文献などの後半は不要
        text = re.split(r"\n(See also|References|External links|Notes)\n", text)[0]
        return {"text": text[:8000]}
    return (_cached(f"wiki-text:{lang}:{title}", 24 * 30, fetch) or {}).get("text", "")


# ---------- YouTube ----------

def youtube_enabled():
    return bool(os.environ.get("YOUTUBE_API_KEY"))


def _iso_duration_sec(s):
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s or "")
    if not m:
        return 0
    h, mi, se = (int(x or 0) for x in m.groups())
    return h * 3600 + mi * 60 + se


def youtube_news_candidates(country_name_en):
    """その国の最近の英語ニュース動画（1〜6分、埋め込み可）を探す"""
    if not youtube_enabled():
        return []
    key = os.environ["YOUTUBE_API_KEY"]

    def fetch():
        since = (datetime.now(timezone.utc) - timedelta(days=60)).strftime("%Y-%m-%dT%H:%M:%SZ")
        r = requests.get("https://www.googleapis.com/youtube/v3/search", timeout=15, params={
            "part": "snippet", "type": "video", "videoEmbeddable": "true", "videoCaption": "any",
            "relevanceLanguage": "en", "safeSearch": "strict", "maxResults": 15, "order": "relevance",
            "publishedAfter": since, "q": f"{country_name_en} news", "key": key,
        })
        r.raise_for_status()
        items = r.json().get("items", [])
        ids = [it["id"]["videoId"] for it in items]
        if not ids:
            return []
        r2 = requests.get("https://www.googleapis.com/youtube/v3/videos", timeout=15, params={
            "part": "contentDetails,snippet", "id": ",".join(ids), "key": key,
        })
        r2.raise_for_status()
        out = []
        for v in r2.json().get("items", []):
            sec = _iso_duration_sec(v["contentDetails"].get("duration"))
            lang = (v["snippet"].get("defaultAudioLanguage") or "en").lower()
            if 60 <= sec <= 360 and lang.startswith("en"):
                out.append({"id": v["id"], "title": v["snippet"]["title"],
                            "channel": v["snippet"]["channelTitle"], "seconds": sec,
                            "published": v["snippet"]["publishedAt"][:10]})
        return out
    return _cached(f"yt-search:{country_name_en}", 12, fetch) or []
