"""SQLite の接続と初期データの投入"""
import json
import random
import sqlite3
from pathlib import Path

from flask import current_app, g

BASE_DIR = Path(__file__).resolve().parent


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def query(sql, args=(), one=False):
    cur = get_db().execute(sql, args)
    rows = cur.fetchall()
    return (rows[0] if rows else None) if one else rows


def execute(sql, args=()):
    db = get_db()
    cur = db.execute(sql, args)
    db.commit()
    return cur


def init_db():
    db = get_db()
    db.executescript((BASE_DIR / "schema.sql").read_text(encoding="utf-8"))
    if db.execute("SELECT COUNT(*) FROM countries").fetchone()[0] == 0:
        seed(db)
    db.commit()


def seed(db):
    data = json.loads((BASE_DIR / "data" / "seed.json").read_text(encoding="utf-8"))
    for c in data["countries"]:
        db.execute(
            """INSERT INTO countries (id, country_name, name_en, code, region, lat, lng, color, wiki_ja,
                 capital, language, currency, phrase_local, phrase_ja, description, tour_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (c["id"], c["name"], c["nameEn"], c["code"], c["region"], c["lat"], c["lng"], c["color"],
             c["wikiJa"], c["capital"], c["language"], c["currency"], c["phrase"]["local"],
             c["phrase"]["ja"], c["desc"], c["tour_order"]),
        )
        for i, t in enumerate(c["trips"]):
            db.execute(
                """INSERT INTO trips (id, trip_name, country_id, wiki_page_title, name_en, image_key, category,
                     city, tip, description, level, minutes, sort_order)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (t["id"], t["name"], c["id"], t["wiki"], t["nameEn"], t.get("img"), t["category"],
                 t["city"], t["tip"], t["desc"], t["level"], t["minutes"], i),
            )
            lesson = {"article": t["article"], "questions": shuffle_choices(t["questions"], t["id"]),
                      "summary": t["summary"]}
            db.execute(
                "INSERT INTO lessons (trip_id, level, source, payload) VALUES (?, ?, 'seed', ?)",
                (t["id"], t["level"], json.dumps(lesson, ensure_ascii=False)),
            )
        db.execute(
            "INSERT INTO news (country_id, source, payload) VALUES (?, 'seed', ?)",
            (c["id"], json.dumps({**c["news"], "questions": shuffle_choices(c["news"]["questions"], c["id"])},
                                 ensure_ascii=False)),
        )
    for word, v in data["glossary"].items():
        db.execute("INSERT OR IGNORE INTO glossary (word, pos, meaning) VALUES (?, ?, ?)",
                   (word, v["pos"], v["meaning"]))


def shuffle_choices(questions, seed_key):
    """手書きの問題は正解の位置が偏りやすいので、選択肢を並べ替える（毎回同じ結果になるよう固定シード）"""
    rng = random.Random(seed_key)
    out = []
    for q in questions:
        choices = list(q["choices"])
        correct = choices[q["answer"]]
        rng.shuffle(choices)
        out.append({**q, "choices": choices, "answer": choices.index(correct)})
    return out
