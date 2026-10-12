"""GitHub Pages 用の公開版（サーバーなしで動く版）を _site/ に書き出す

使い方: python build_static.py
GitHub Actions（.github/workflows/pages.yml）が push のたびに実行して公開する。
"""
import json
import re
import shutil
from pathlib import Path

from db import shuffle_choices

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "_site"


def site_data():
    seed = json.loads((ROOT / "data" / "seed.json").read_text(encoding="utf-8"))
    countries, lessons, news = [], {}, {}
    for c in sorted(seed["countries"], key=lambda x: x["tour_order"]):
        trips = []
        for t in c["trips"]:
            trips.append({"id": t["id"], "name": t["name"], "nameEn": t["nameEn"], "wiki": t["wiki"],
                          "img": t.get("img") or t["wiki"], "category": t["category"], "city": t["city"],
                          "tip": t["tip"], "desc": t["desc"], "level": t["level"], "minutes": t["minutes"],
                          "countryId": c["id"]})
            # サーバー版と同じ並べ替えにして、正解の位置をそろえる
            lessons[t["id"]] = {"level": t["level"], "article": t["article"],
                                "questions": shuffle_choices(t["questions"], t["id"]), "summary": t["summary"]}
        news[c["id"]] = {**c["news"], "questions": shuffle_choices(c["news"]["questions"], c["id"])}
        countries.append({"id": c["id"], "name": c["name"], "nameEn": c["nameEn"], "code": c["code"],
                          "region": c["region"], "lat": c["lat"], "lng": c["lng"], "color": c["color"],
                          "capital": c["capital"], "language": c["language"], "currency": c["currency"],
                          "phrase": c["phrase"], "desc": c["desc"], "tourOrder": c["tour_order"],
                          "wikiJa": c["wikiJa"], "trips": trips})
    return {"countries": countries, "lessons": lessons, "news": news, "glossary": seed["glossary"]}


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(ROOT / "static", OUT / "static")

    # Pages はサブパス（/リポジトリ名/）で配信されるので、パスはすべて相対にする
    html = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
    html = re.sub(r"\{\{\s*url_for\('static',\s*filename='([^']+)'\)\s*\}\}", r"static/\1", html)
    html = html.replace('href="/manifest.webmanifest"', 'href="manifest.webmanifest"')
    html = html.replace('<script src="static/js/app.js"></script>',
                        '<script src="static/js/local-api.js"></script>\n  <script src="static/js/app.js"></script>')
    assert "local-api.js" in html and "{{" not in html, "index.html の変換に失敗しました"
    (OUT / "index.html").write_text(html, encoding="utf-8")

    manifest = json.loads((ROOT / "static" / "manifest.webmanifest").read_text(encoding="utf-8"))
    manifest["start_url"] = "./"
    manifest["icons"][0]["src"] = "static/icon.svg"
    (OUT / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    (OUT / "static" / "data").mkdir(exist_ok=True)
    (OUT / "static" / "data" / "site-data.json").write_text(
        json.dumps(site_data(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / ".nojekyll").write_text("", encoding="utf-8")
    print(f"built {OUT}")


if __name__ == "__main__":
    main()
