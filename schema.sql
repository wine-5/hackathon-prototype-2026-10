-- TabiYomi のテーブル定義

CREATE TABLE IF NOT EXISTS countries (
  id            TEXT PRIMARY KEY,
  country_name  TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  code          TEXT NOT NULL,
  region        TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  color         TEXT NOT NULL,
  wiki_ja       TEXT NOT NULL,
  capital       TEXT,
  language      TEXT,
  currency      TEXT,
  phrase_local  TEXT,
  phrase_ja     TEXT,
  description   TEXT,
  tour_order    INTEGER
);

CREATE TABLE IF NOT EXISTS trips (
  id               TEXT PRIMARY KEY,
  trip_name        TEXT NOT NULL,
  country_id       TEXT NOT NULL REFERENCES countries(id),
  wiki_page_title  TEXT NOT NULL,
  name_en          TEXT NOT NULL,
  image_key        TEXT,
  category         TEXT NOT NULL,          -- sight / culture
  city             TEXT,
  tip              TEXT,
  description      TEXT,
  level            TEXT,
  minutes          INTEGER,
  sort_order       INTEGER
);

-- 記事と問題。source = seed（手書き）/ gemini（Wikipedia をもとに生成）
CREATE TABLE IF NOT EXISTS lessons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id     TEXT NOT NULL REFERENCES trips(id),
  level       TEXT NOT NULL,
  source      TEXT NOT NULL,
  payload     TEXT NOT NULL,               -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lessons_trip ON lessons(trip_id, level, id);

-- リスニング用ニュース。source = seed / youtube
CREATE TABLE IF NOT EXISTS news (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id  TEXT NOT NULL REFERENCES countries(id),
  source      TEXT NOT NULL,
  video_id    TEXT,
  payload     TEXT NOT NULL,               -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_news_country ON news(country_id, id);

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  display_name   TEXT NOT NULL,
  level          TEXT NOT NULL DEFAULT 'B1',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stamps (
  user_id     INTEGER NOT NULL REFERENCES users(id),
  country_id  TEXT NOT NULL REFERENCES countries(id),
  earned_at   TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  PRIMARY KEY (user_id, country_id)
);

CREATE TABLE IF NOT EXISTS history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  kind           TEXT NOT NULL,            -- read / listen
  ref_id         TEXT NOT NULL,            -- trip id / country id
  country_id     TEXT NOT NULL,
  title          TEXT NOT NULL,
  correct        INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  summary_score  INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, id);

CREATE TABLE IF NOT EXISTS saved_words (
  user_id     INTEGER NOT NULL REFERENCES users(id),
  word        TEXT NOT NULL,
  pos         TEXT,
  meaning     TEXT NOT NULL,
  source      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_words ON saved_words(user_id, word);

CREATE TABLE IF NOT EXISTS wants (
  user_id     INTEGER NOT NULL REFERENCES users(id),
  trip_id     TEXT NOT NULL REFERENCES trips(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, trip_id)
);

-- 単語の意味（初期データ＋Gemini で調べた結果をためていく）
CREATE TABLE IF NOT EXISTS glossary (
  word     TEXT PRIMARY KEY,
  pos      TEXT,
  meaning  TEXT NOT NULL,
  source   TEXT NOT NULL DEFAULT 'seed'
);

-- Wikipedia などの外部 API のレスポンスキャッシュ
CREATE TABLE IF NOT EXISTS cache (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
