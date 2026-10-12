# TabiYomi（仮）

行きたい国の観光地や文化、ニュースを通して英語を学べる Web アプリです。
海外旅行に行きたい人が、旅行先の観光名所・文化・ニュースを題材に英語のリーディングとリスニングを練習でき、同時に旅行の下調べもできます。

## できること

| 機能 | 内容 |
|---|---|
| ログイン | ユーザー登録・ログイン（パスワードはハッシュ化して保存） |
| 国の選択 | 地図（地域で絞り込み）または一覧から選ぶ。国の基本情報は日本語版 Wikipedia から取得 |
| リーディング | 観光名所・文化の英文記事。4択問題とヒント、要約（英語／日本語）を採点 |
| 単語検索 | 記事中の単語をタップすると意味を表示。単語帳に保存してカードで復習 |
| リスニング | ニュース動画（または練習用ニュースの読み上げ）を聴いて4択問題 |
| 世界一周 | 各国で6割以上正解するとスタンプ。6か国でゴール |
| 旅の情報 | 記事ごとの「旅のメモ」、行きたい場所のリスト |

## 動かし方（Windows）

```powershell
cd Hackathon
py -3.12 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      # API キーを入れる場合は .env を編集
python app.py
```

ブラウザで http://127.0.0.1:5000 を開き、「新規登録」からアカウントを作ります。
初回起動時に `instance/tabiyomi.db` が作られ、6か国・18本の記事が入ります。

スマホで試すときは `.env` に `HOST=0.0.0.0` を書いて起動し、同じ Wi-Fi のスマホから `http://<PCのIPアドレス>:5000` を開きます。ホーム画面に追加すると、アプリのように全画面で使えます。

## 公開版（GitHub Pages）

https://wine-5.github.io/hackathon-prototype-2026-10/

`main` に push すると、GitHub Actions（`.github/workflows/pages.yml`）が `build_static.py` で公開版を作り、Pages に載せます。

GitHub Pages ではサーバー（Flask）が動かないので、公開版は次のように動きます。

- `/api/*` の処理を `static/js/local-api.js` がブラウザの中で行う
- アカウントと学習記録は、それぞれのブラウザの中（localStorage）にだけ保存される。別の端末とは共有されない
- Gemini と YouTube は使わない（API キーを公開ページに置くと誰でも見られてしまうため）。記事と問題は `data/seed.json` の教材を使う

公開版を手元で確認したいときは、`python build_static.py` を実行して `_site/` を開きます。

## API キーについて

キーがなくても全機能が動きます。その場合は、手書きの記事・問題と、キーワードによる要約採点を使います。

| `.env` の設定 | 有効になるもの |
|---|---|
| `GEMINI_API_KEY` | Wikipedia の記事をもとに、ユーザーのレベル（A2/B1/B2）に合わせた記事と問題を生成／要約の採点と講評／辞書にない単語の意味 |
| `GEMINI_API_KEY` と `YOUTUBE_API_KEY` | その国の最近の英語ニュース動画を探し、動画の内容から問題を作る |

- Gemini のキーは [Google AI Studio](https://aistudio.google.com/apikey)、YouTube Data API のキーは Google Cloud Console で発行します。
- 生成した記事・問題は DB に保存して使い回します（同じ記事を開くたびに API を呼ばない）。記事画面の「別の文章で解く」で作り直せます。
- Gemini の呼び出しに失敗したときは、自動で手書きの教材に切り替わります。
- 生成文が機械的にならないよう、`ai.py` のプロンプトで文体を指定しています（大げさな褒め言葉や決まり文句、絵文字を使わない、など）。

## 構成

```
Hackathon/
├── app.py            Flask 本体（画面と /api/*）
├── db.py             SQLite の接続と初期データ投入
├── schema.sql        テーブル定義
├── ai.py             Gemini API（記事・問題の生成、採点、単語の意味、動画から問題）
├── sources.py        Wikipedia API と YouTube Data API（結果は cache テーブルに保存）
├── data/seed.json    初期データ（国・観光地・手書きの記事と問題・単語）
├── templates/index.html
└── static/           css / js / アイコン
```

主なテーブル: `countries`、`trips`（`wiki_page_title` を持つ）、`lessons`（記事と問題）、`news`、`users`、`stamps`、`history`、`saved_words`、`wants`、`glossary`、`cache`

## 注意

- 練習用ニュース（キーなしのとき）は学習用に作った架空の内容です。
- 「旅のメモ」は一般的な情報です。料金や予約方法は変わることがあるので、旅行前に公式情報を確認してください。
- 地図は OpenStreetMap の標準タイルを使っています。一般公開して利用者が増える場合は、利用規約に沿ったタイル配信サービスに切り替えてください。
