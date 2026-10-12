// GitHub Pages 公開版用：/api/* をブラウザの中で処理する（サーバーなしで動かすため）
// アカウントと学習記録は localStorage に保存する。Gemini / YouTube は使わない。
(() => {
  "use strict";

  const STORE_KEY = "tabiyomi.static.v1";
  const STAMP_RATE = 0.6;
  const LEVELS = ["A2", "B1", "B2"];

  let dataPromise = null;
  const siteData = () => (dataPromise ||= fetch("static/data/site-data.json").then((r) => r.json()));

  const emptyDb = () => ({ users: {}, current: null, progress: {} });
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || emptyDb(); } catch (e) { return emptyDb(); }
  }
  function save(db) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { /* 保存できない環境では何もしない */ }
  }

  class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  const fail = (status, message) => { throw new HttpError(status, message); };

  const pad = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const nowStr = () => { const d = new Date(); return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

  async function hashPassword(username, password) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tabiyomi:${username}:${password}`));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function requireUser(db) {
    const u = db.current && db.users[db.current];
    if (!u) fail(401, "ログインしてください");
    db.progress[db.current] ||= { stamps: {}, history: [], words: [], wants: [] };
    return { user: u, prog: db.progress[db.current] };
  }

  function streakDays(history) {
    const days = new Set(history.map((h) => h.at.slice(0, 10)));
    const d = new Date();
    const key = () => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (!days.has(key())) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(key())) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // 単語の活用形から辞書の見出し語の候補を作る（サーバー版の word_candidates と同じ）
  function wordCandidates(word) {
    let w = word.toLowerCase().replace(/’/g, "'").replace(/'s$/, "");
    const out = [w];
    for (const [suf, rep] of [["ies", "y"], ["es", ""], ["s", ""], ["ed", ""], ["ed", "e"], ["d", ""], ["ing", ""], ["ing", "e"]]) {
      if (w.endsWith(suf) && w.length > suf.length + 2) out.push(w.slice(0, -suf.length) + rep);
    }
    return [...new Set(out)];
  }
  function glossaryWordsIn(texts, glossary) {
    const found = new Set();
    texts.forEach((t) => (t.match(/[A-Za-z][A-Za-z'’-]*/g) || []).forEach((w) => {
      if (wordCandidates(w).some((c) => glossary[c])) found.add(w.toLowerCase());
    }));
    return [...found].sort();
  }

  const publicQuestions = (qs) => qs.map((q) => ({ q: q.q, choices: q.choices, hint: q.hint || "" }));

  function checkAnswers(qs, answers) {
    let correct = 0;
    const results = qs.map((q, i) => {
      const a = answers[i] ?? null;
      const ok = a === q.answer;
      if (ok) correct++;
      return { ok, answer: q.answer, chosen: a, explain: q.explain || "" };
    });
    return { correct, results };
  }

  // 要約の簡易採点（サーバー版の keyword_grade と同じ考え方）
  function keywordGrade(text, summary) {
    const t = text.toLowerCase();
    const hit = [], miss = [];
    summary.keywords.forEach((alts) => (alts.some((a) => t.includes(a.toLowerCase())) ? hit : miss).push(alts[0]));
    const isJa = /[぀-ヿ一-龯]/.test(text);
    const len = text.trim().length;
    let score = Math.round((hit.length / Math.max(1, summary.keywords.length)) * 80);
    if (len >= (isJa ? 30 : 60)) score += 20;
    else if (len >= (isJa ? 15 : 30)) score += 10;
    const improve = [];
    if (miss.length) improve.push("「" + miss.slice(0, 3).join("」「") + "」にあたる内容が入っていません。");
    if (isJa) improve.push("内容はつかめています。次は英語で書いてみてください。");
    else if (len < 60) improve.push("1文だけだと情報が足りません。2文くらいにまとめると要点が伝わります。");
    return { score: Math.min(100, score), good: [], improve, rewrite: "", hit, miss, by: "basic", model: summary.model };
  }

  function recordResult(prog, kind, refId, countryId, title, correct, total, summaryScore = null) {
    prog.history.unshift({ kind, id: refId, country: countryId, title, correct, total, summary_score: summaryScore, at: nowStr() });
    prog.history = prog.history.slice(0, 200);
    let isNew = false;
    if (correct / total >= STAMP_RATE && !prog.stamps[countryId]) { prog.stamps[countryId] = today(); isNew = true; }
    return { new: isNew, date: prog.stamps[countryId] || null };
  }

  // ---------- Wikipedia（ブラウザから直接取得） ----------
  const wikiCache = new Map();
  function wikiSummary(lang, title) {
    const key = `${lang}:${title}`;
    if (!wikiCache.has(key)) {
      wikiCache.set(key, fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    return wikiCache.get(key);
  }
  async function imageUrl(key, large) {
    const m = key.match(/^([a-z]{2}):(.+)$/);
    const d = await (m ? wikiSummary(m[1], m[2]) : wikiSummary("en", key));
    const thumb = d && d.thumbnail && d.thumbnail.source;
    if (!thumb) return null;
    return large ? thumb.replace(/\/\d+px-/, "/960px-") : thumb;
  }

  // ---------- ルーティング ----------
  async function request(method, path, body = {}) {
    const url = new URL(path, location.href);
    const p = url.pathname.replace(/^.*?\/api\//, "/api/");
    const data = await siteData();
    const db = load();
    let m;

    if (p === "/api/status") return { gemini: false, youtube: false, static: true };

    if (p === "/api/signup" && method === "POST") {
      const username = (body.username || "").trim();
      const password = body.password || "";
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) fail(400, "ユーザー名は半角英数字と _ で3〜20文字にしてください");
      if (password.length < 6) fail(400, "パスワードは6文字以上にしてください");
      if (db.users[username]) fail(400, "このユーザー名はすでに使われています");
      db.users[username] = {
        username, hash: await hashPassword(username, password),
        name: ((body.displayName || "").trim() || username).slice(0, 16),
        level: LEVELS.includes(body.level) ? body.level : "B1"
      };
      db.current = username;
      save(db);
      return { ok: true };
    }
    if (p === "/api/login" && method === "POST") {
      const username = (body.username || "").trim();
      const u = db.users[username];
      if (!u || u.hash !== await hashPassword(username, body.password || "")) fail(401, "ユーザー名かパスワードが違います");
      db.current = username;
      save(db);
      return { ok: true };
    }
    if (p === "/api/logout") { db.current = null; save(db); return { ok: true }; }

    const { user, prog } = requireUser(db);
    const done = (result) => { save(db); return result; };

    if (p === "/api/me" && method === "GET") {
      return done({
        user: { name: user.name, username: user.username, level: user.level },
        stamps: prog.stamps, wants: prog.wants, history: prog.history.slice(0, 50),
        wordCount: prog.words.length, streak: streakDays(prog.history)
      });
    }
    if (p === "/api/me" && method === "PATCH") {
      if (LEVELS.includes(body.level)) user.level = body.level;
      if ((body.displayName || "").trim()) user.name = body.displayName.trim().slice(0, 16);
      return done({ ok: true });
    }
    if (p === "/api/me/progress" && method === "DELETE") {
      db.progress[db.current] = { stamps: {}, history: [], words: [], wants: [] };
      return done({ ok: true });
    }

    if (p === "/api/countries") return data.countries;
    if ((m = p.match(/^\/api\/countries\/(\w+)\/info$/))) {
      const c = data.countries.find((x) => x.id === m[1]) || fail(404, "見つかりません");
      const s = await wikiSummary("ja", c.wikiJa);
      return { extract: (s && s.extract) || c.desc, url: s && s.content_urls ? s.content_urls.desktop.page : null };
    }
    if ((m = p.match(/^\/api\/wants\/(\w+)$/)) && method === "POST") {
      const id = m[1];
      const wanted = !prog.wants.includes(id);
      prog.wants = wanted ? [id, ...prog.wants] : prog.wants.filter((x) => x !== id);
      return done({ wanted });
    }

    if ((m = p.match(/^\/api\/trips\/(\w+)\/lesson$/))) {
      const L = data.lessons[m[1]] || fail(404, "記事が見つかりません");
      return {
        id: m[1], source: "seed", level: L.level, article: L.article, questions: publicQuestions(L.questions),
        keywords: glossaryWordsIn(L.article.paragraphs, data.glossary), canRegenerate: false
      };
    }
    if ((m = p.match(/^\/api\/lessons\/(\w+)\/grade$/)) && method === "POST") {
      const L = data.lessons[m[1]] || fail(404, "記事が見つかりません");
      const trip = data.countries.flatMap((c) => c.trips).find((t) => t.id === m[1]);
      const { correct, results } = checkAnswers(L.questions, body.answers || []);
      const text = (body.summary || "").trim();
      const summary = text ? keywordGrade(text, L.summary) : null;
      const stamp = recordResult(prog, "read", trip.id, trip.countryId, trip.name, correct, L.questions.length, summary ? summary.score : null);
      return done({ correct, total: L.questions.length, results, summary, stamp });
    }

    if ((m = p.match(/^\/api\/countries\/(\w+)\/news$/))) {
      const n = data.news[m[1]] || fail(404, "ニュースが見つかりません");
      return {
        id: m[1], source: "seed", video: null, headline: n.headline, script: n.script, summaryJa: n.summaryJa,
        summaryEn: n.summaryEn, questions: publicQuestions(n.questions), keywords: glossaryWordsIn([n.script], data.glossary),
        canRegenerate: false
      };
    }
    if ((m = p.match(/^\/api\/news\/(\w+)\/grade$/)) && method === "POST") {
      const n = data.news[m[1]] || fail(404, "ニュースが見つかりません");
      const { correct, results } = checkAnswers(n.questions, body.answers || []);
      const stamp = recordResult(prog, "listen", m[1], m[1], n.headline, correct, n.questions.length);
      return done({ correct, total: n.questions.length, results, stamp });
    }

    if (p === "/api/lookup") {
      const word = (url.searchParams.get("w") || "").trim().slice(0, 40);
      if (!/^[A-Za-z][A-Za-z'’-]*$/.test(word)) fail(400, "単語を指定してください");
      for (const c of wordCandidates(word)) {
        const g = data.glossary[c];
        if (g) return { word: c, pos: g.pos, meaning: g.meaning, lang: "ja" };
      }
      try {
        const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
        if (r.ok) {
          const mm = (await r.json())[0].meanings[0];
          const pos = { noun: "名", verb: "動", adjective: "形", adverb: "副" }[mm.partOfSpeech] || "";
          return { word: word.toLowerCase(), pos, meaning: mm.definitions[0].definition, lang: "en" };
        }
      } catch (e) { /* 辞書が使えなくても続ける */ }
      return { word: word.toLowerCase(), pos: "", meaning: "", lang: "" };
    }
    if (p === "/api/words" && method === "GET") return prog.words;
    if (p === "/api/words" && method === "POST") {
      const word = (body.word || "").trim().toLowerCase().slice(0, 40);
      const meaning = (body.meaning || "").trim().slice(0, 200);
      if (!word || !meaning) fail(400, "単語と意味が必要です");
      prog.words = [{ word, pos: body.pos || "", meaning, source: (body.source || "").slice(0, 60) }, ...prog.words.filter((w) => w.word !== word)];
      return done({ ok: true });
    }
    if ((m = p.match(/^\/api\/words\/(.+)$/)) && method === "DELETE") {
      const w = decodeURIComponent(m[1]).toLowerCase();
      prog.words = prog.words.filter((x) => x.word !== w);
      return done({ ok: true });
    }

    fail(404, "見つかりません");
  }

  window.LocalApi = { request, imageUrl };
})();
