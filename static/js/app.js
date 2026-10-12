// TabiYomi フロントエンド（ハッシュルーティングの SPA。データは Flask の /api から取得）
(() => {
  "use strict";

  // ---------- 小物 ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LETTERS = ["A", "B", "C", "D"];
  const fmtDate = (s) => (s ? s.slice(0, 10).replace(/-/g, "/") : "");

  const REGIONS = [
    { id: "all", name: "すべて", center: [25, 20], zoom: 2 },
    { id: "europe", name: "ヨーロッパ", center: [48, 6], zoom: 4 },
    { id: "africa", name: "アフリカ", center: [10, 20], zoom: 3 },
    { id: "oceania", name: "オセアニア", center: [-25, 140], zoom: 3 },
    { id: "americas", name: "アメリカ大陸", center: [38, -98], zoom: 3 }
  ];
  const CATEGORY = {
    sight: { label: "観光名所", cls: "blue", icon: "pin" },
    culture: { label: "文化", cls: "purple", icon: "sparkle" }
  };

  const ICON = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor" stroke="none"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    read: '<path d="M3 5h7a3 3 0 0 1 2 1 3 3 0 0 1 2-1h7v14h-7a3 3 0 0 0-2 1 3 3 0 0 0-2-1H3z"/><path d="M12 6v14"/>',
    headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>',
    plane: '<path d="M10.5 13.5L3 11l1.5-1.5 8 .5L17 5.5a2 2 0 0 1 3 3L15.5 13l.5 8L14.5 22.5 12 15z"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    cc: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    stamp: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    heart: '<path d="M12 20s-7.5-4.6-9.2-9.4A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 9.2 4C19.5 15.4 12 20 12 20z"/>',
    flame: '<path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3 2-5.1 3.6-6.8.5 1.6 1.4 2.7 2.6 3.2C11 7 12.5 4.5 15 3c-.3 2.6.8 4.4 2.2 6 1.1 1.3 1.8 2.9 1.8 4.9 0 4-3.1 7.1-7 7.1z"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>'
  };
  const icon = (name, size = 20) =>
    `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

  // ---------- API ----------
  class ApiError extends Error {
    constructor(msg, status) { super(msg); this.status = status; }
  }
  async function api(path, { method = "GET", body } = {}) {
    // GitHub Pages 公開版ではサーバーがないので、ブラウザ内の LocalApi で処理する
    if (window.LocalApi) {
      try {
        return await window.LocalApi.request(method, path, body);
      } catch (e) {
        if (e.status === 401 && !path.startsWith("/api/login")) { me = null; location.hash = "#/login"; }
        throw new ApiError(e.message || "エラーが発生しました", e.status || 0);
      }
    }
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin"
      });
    } catch (e) {
      throw new ApiError("サーバーに接続できません。通信状況を確認してください。", 0);
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith("/api/login")) {
      me = null;
      location.hash = "#/login";
      throw new ApiError(data.error || "ログインしてください", 401);
    }
    if (!res.ok) throw new ApiError(data.error || "エラーが発生しました（" + res.status + "）", res.status);
    return data;
  }

  // ---------- データ ----------
  let me = null;          // /api/me の結果
  let COUNTRIES = [];     // /api/countries の結果
  let status = { gemini: false, youtube: false };

  const countryById = (id) => COUNTRIES.find((c) => c.id === id);
  const allTrips = () => COUNTRIES.flatMap((c) => c.trips.map((t) => ({ ...t, country: c })));
  const tripById = (id) => allTrips().find((t) => t.id === id);
  const tourStops = () => [...COUNTRIES].filter((c) => c.tourOrder).sort((a, b) => a.tourOrder - b.tourOrder);
  const nextStop = () => tourStops().find((c) => !me.stamps[c.id]) || null;
  const stampCount = () => Object.keys(me.stamps).length;
  const isDone = (kind, id) => me.history.some((h) => h.kind === kind && h.id === id);
  const isWanted = (id) => me.wants.includes(id);

  async function loadBase() {
    const [m, cs, st] = await Promise.all([api("/api/me"), api("/api/countries"), api("/api/status").catch(() => status)]);
    me = m; COUNTRIES = cs; status = st;
  }
  async function refreshMe() { me = await api("/api/me"); }

  // ---------- トースト / モーダル ----------
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }
  function openModal(html, { onMount } = {}) {
    closeModal();
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) closeModal(); });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("show"));
    onMount && onMount(wrap);
  }
  function closeModal() { $$(".modal-backdrop").forEach((m) => m.remove()); }

  // ---------- 画像（サーバー経由で Wikipedia の画像を取得） ----------
  function hydrateImages(root = document) {
    $$("[data-img]", root).forEach((el) => {
      if (el.querySelector("img")) return;
      const img = new Image();
      img.alt = "";
      img.onload = () => { el.appendChild(img); requestAnimationFrame(() => img.classList.add("in")); };
      const lg = el.dataset.size === "lg";
      if (window.LocalApi) {
        window.LocalApi.imageUrl(el.dataset.img, lg).then((url) => { if (url) img.src = url; });
      } else {
        img.src = `/api/image?key=${encodeURIComponent(el.dataset.img)}${lg ? "&lg=1" : ""}`;
      }
    });
  }

  // ---------- 音声（Web Speech API） ----------
  const Speech = {
    supported: "speechSynthesis" in window,
    sentences: [], idx: 0, rate: 1, playing: false, token: 0, startedAt: 0,
    onChange: null,
    load(text) { this.stop(); this.sentences = (text.match(/[^.!?]+[.!?]+["”]?/g) || [text]).map((s) => s.trim()); this.idx = 0; },
    estSec(s) { return (s.split(/\s+/).length / 2.6) / this.rate; },
    totalSec() { return this.sentences.reduce((a, s) => a + this.estSec(s), 0); },
    elapsedSec() {
      const done = this.sentences.slice(0, this.idx).reduce((a, s) => a + this.estSec(s), 0);
      if (!this.playing || !this.sentences[this.idx]) return done;
      return done + Math.min((performance.now() - this.startedAt) / 1000, this.estSec(this.sentences[this.idx]) * 0.98);
    },
    voice() {
      const vs = this.supported ? speechSynthesis.getVoices() : [];
      return vs.find((v) => /^en(-|_)(US|GB)/i.test(v.lang) && /Google|Natural|Microsoft/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang)) || null;
    },
    play() {
      if (this.idx >= this.sentences.length) this.idx = 0;
      this.playing = true;
      this.speakCurrent();
      this.emit();
    },
    speakCurrent() {
      const my = ++this.token;
      const text = this.sentences[this.idx];
      this.startedAt = performance.now();
      const next = () => {
        if (my !== this.token || !this.playing) return;
        this.idx++;
        if (this.idx >= this.sentences.length) { this.playing = false; this.emit(); return; }
        this.speakCurrent();
        this.emit();
      };
      if (this.supported) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = this.voice();
        if (v) u.voice = v;
        u.lang = v ? v.lang : "en-US";
        u.rate = this.rate;
        u.onend = next;
        u.onerror = next;
        speechSynthesis.speak(u);
      } else {
        setTimeout(next, this.estSec(text) * 1000);
      }
    },
    pause() { this.playing = false; this.token++; if (this.supported) speechSynthesis.cancel(); this.emit(); },
    stop() { this.pause(); this.idx = 0; },
    seek(frac) {
      const wasPlaying = this.playing;
      this.pause();
      this.idx = Math.min(this.sentences.length - 1, Math.floor(frac * this.sentences.length));
      if (wasPlaying) this.play(); else this.emit();
    },
    setRate(r) { this.rate = r; if (this.playing) { this.pause(); this.play(); } },
    emit() { this.onChange && this.onChange(); }
  };
  function speakWord(word) {
    if (!Speech.supported) return toast("このブラウザは音声の読み上げに対応していません");
    Speech.pause();
    const u = new SpeechSynthesisUtterance(word);
    const v = Speech.voice();
    if (v) u.voice = v;
    u.lang = v ? v.lang : "en-US";
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }

  // ---------- 単語タップで意味を調べる ----------
  // 単語と記号に分けてから個別にエスケープする（先に全体をエスケープすると &quot; などが壊れる）
  function tokenize(text, keywords = new Set()) {
    return text.split(/(\p{L}[\p{L}'’-]*)/u).map((part, i) => {
      if (i % 2 === 0) return esc(part);
      const kw = keywords.has(part.toLowerCase());
      return `<span class="w${kw ? " kw" : ""}" data-w="${esc(part)}">${esc(part)}</span>`;
    }).join("");
  }

  let popEl = null;
  function closePopover() { if (popEl) { popEl.remove(); popEl = null; } $$(".w.on").forEach((x) => x.classList.remove("on")); }
  function placePopover(target) {
    if (window.innerWidth >= 720) {
      const r = target.getBoundingClientRect();
      const pw = popEl.offsetWidth;
      let left = r.left + r.width / 2 - pw / 2 + window.scrollX;
      left = Math.max(12, Math.min(left, window.scrollX + window.innerWidth - pw - 12));
      const below = r.bottom + 10 + popEl.offsetHeight < window.innerHeight;
      popEl.style.left = left + "px";
      popEl.style.top = (below ? r.bottom + 8 : r.top - popEl.offsetHeight - 8) + window.scrollY + "px";
    } else {
      popEl.classList.add("sheet");
    }
  }
  async function openWordPopover(target, source) {
    closePopover();
    const word = target.dataset.w;
    const context = (target.closest("p") || target.parentElement).textContent;
    target.classList.add("on");
    const el = document.createElement("div");
    el.className = "pop";
    el.innerHTML = `<div class="pop-head"><strong class="pop-word">${esc(word.toLowerCase())}</strong></div><p class="pop-mean muted"><span class="spinner dark sm"></span> 調べています</p>`;
    popEl = el;
    document.body.appendChild(el);
    placePopover(target);

    let entry;
    try {
      entry = await api(`/api/lookup?w=${encodeURIComponent(word)}&context=${encodeURIComponent(context)}`);
    } catch (e) {
      entry = { word: word.toLowerCase(), meaning: "", lang: "" };
    }
    if (popEl !== el) return;
    el.innerHTML = `
      <div class="pop-head">
        <strong class="pop-word">${esc(entry.word)}</strong>
        ${entry.pos ? `<span class="pos">${esc(entry.pos)}</span>` : ""}
        <button class="icon-btn sm" data-act="speak" aria-label="発音を聞く">${icon("volume", 18)}</button>
      </div>
      <p class="pop-mean ${entry.lang === "en" ? "en" : ""}">${entry.meaning ? esc(entry.meaning) : '<span class="muted">意味が見つかりませんでした。</span>'}</p>
      ${entry.lang === "en" ? '<p class="muted small">日本語訳が見つからなかったため、英英辞書の説明を表示しています。</p>' : ""}
      ${entry.meaning ? `<button class="btn primary sm block" data-act="save">${icon("plus", 16)} 単語帳に追加</button>` : ""}`;
    placePopover(target);
    el.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]");
      if (!act) return;
      if (act.dataset.act === "speak") speakWord(entry.word);
      if (act.dataset.act === "save") {
        act.disabled = true;
        try {
          await api("/api/words", { method: "POST", body: { word: entry.word, pos: entry.pos, meaning: entry.meaning, source } });
          me.wordCount++;
          toast(`「${entry.word}」を単語帳に追加しました`);
          closePopover();
        } catch (err) { toast(err.message); act.disabled = false; }
      }
    });
  }
  document.addEventListener("click", (e) => {
    const w = e.target.closest(".w");
    if (w) {
      e.stopPropagation();
      const src = w.closest("[data-source]");
      openWordPopover(w, src ? src.dataset.source : "");
      return;
    }
    if (popEl && !e.target.closest(".pop")) closePopover();
  });
  window.addEventListener("resize", closePopover);

  // ---------- 共通パーツ ----------
  const NAV = [
    { key: "home", href: "#/", label: "ホーム", icon: "home" },
    { key: "map", href: "#/map", label: "地図", icon: "map" },
    { key: "tour", href: "#/tour", label: "世界一周", icon: "globe" },
    { key: "words", href: "#/words", label: "単語帳", icon: "book" },
    { key: "me", href: "#/me", label: "マイページ", icon: "user" }
  ];

  const codeBadge = (c, extra = "") => `<span class="code ${extra}" style="--c:${c.color}">${c.code}</span>`;
  const catChip = (t) => { const k = CATEGORY[t.category]; return `<span class="chip ${k.cls}">${icon(k.icon, 14)} ${k.label}</span>`; };
  const streakChip = (cls = "") => `<span class="streak ${cls}" title="連続学習日数">${icon("flame", 18)}<strong>${me.streak}</strong>日</span>`;
  const loading = (msg) => `<div class="loading"><span class="spinner dark"></span><p>${esc(msg)}</p></div>`;
  const errorBox = (msg) => `<div class="card empty"><h2>読み込めませんでした</h2><p class="muted">${esc(msg)}</p><button class="btn ghost" onclick="location.reload()">再読み込み</button></div>`;

  function tripCard(t) {
    const done = isDone("read", t.id);
    return `
      <a class="trip-card" href="#/read/${t.id}">
        <div class="thumb" data-img="${esc(t.img)}" style="--c:${t.country.color}">
          <span class="thumb-label">${esc(t.nameEn)}</span>
          ${done ? `<span class="done-pill">${icon("check", 14)} 学習済み</span>` : isWanted(t.id) ? `<span class="done-pill want">${icon("heart", 14)} 行きたい</span>` : ""}
        </div>
        <div class="trip-body">
          <div class="meta-row">${catChip(t)}<span class="chip">${t.level}</span><span class="muted small">${t.minutes}分</span><span class="muted small city">${icon("pin", 13)}${esc(t.city)}</span></div>
          <h3>${esc(t.name)}</h3>
          <p class="muted small">${esc(t.desc)}</p>
        </div>
      </a>`;
  }

  function newsCard(c) {
    const done = isDone("listen", c.id);
    return `
      <a class="news-card" href="#/listen/${c.id}">
        <div class="news-thumb" data-img="${esc(c.trips[0].img)}" style="--c:${c.color}">
          <span class="play-dot">${icon("play", 22)}</span>
          <span class="live-tag">NEWS</span>
          ${done ? `<span class="done-pill">${icon("check", 14)} 学習済み</span>` : ""}
        </div>
        <div class="trip-body">
          <div class="meta-row"><span class="chip orange">${icon("headphones", 14)} リスニング</span>${codeBadge(c, "sm")}</div>
          <h3>${esc(c.name)}のニュースを聴く</h3>
          <p class="muted small">${status.youtube && status.gemini ? "最近のニュース動画から問題を作ります。" : "練習用のニュース原稿を読み上げます。"}</p>
        </div>
      </a>`;
  }

  // ---------- 画面: ログイン / 新規登録 ----------
  function renderLogin() {
    document.body.classList.add("is-login");
    document.body.classList.remove("is-focus");
    let mode = "login";
    $("#app").innerHTML = `
      <div class="login">
        <section class="login-art">
          <div class="brand light">${icon("globe", 28)}<span>TabiYomi</span></div>
          <div class="login-copy">
            <p class="eyebrow light">Travel × English</p>
            <h1>行きたい国の観光地や文化、<br>ニュースで英語を学ぶ。</h1>
            <p>旅行の下調べをしながら、<br>英語のリーディングとリスニングを練習できます。</p>
          </div>
          <div class="login-stamps">${["GB", "FR", "IT", "EG", "AU", "US"].map((c, i) => `<span class="mini-stamp" style="--c:${["#2f5d8a", "#3b5ba5", "#2f7d5b", "#b07a2a", "#c0573a", "#7a3b6e"][i]};--r:${(i % 2 ? 1 : -1) * (6 + i * 2)}deg">${c}</span>`).join("")}</div>
        </section>
        <section class="login-form-wrap">
          <form class="login-form" id="auth-form" novalidate>
            <div class="auth-tabs" role="tablist">
              <button type="button" class="on" data-mode="login">ログイン</button>
              <button type="button" data-mode="signup">新規登録</button>
            </div>
            <label class="field"><span>ユーザー名</span><input name="username" required maxlength="20" autocomplete="username" placeholder="半角英数字 3〜20文字"></label>
            <label class="field"><span>パスワード</span><input name="password" type="password" required minlength="6" autocomplete="current-password" placeholder="6文字以上"></label>
            <div class="signup-only" hidden>
              <label class="field"><span>表示名</span><input name="displayName" maxlength="16" placeholder="例：ゆうと"></label>
              <label class="field"><span>英語のレベル</span>
                <div class="seg-pick">
                  ${[["A2", "初級"], ["B1", "中級"], ["B2", "中上級"]].map(([v, l], i) => `<label><input type="radio" name="level" value="${v}" ${i === 1 ? "checked" : ""}><span>${v} ${l}</span></label>`).join("")}
                </div>
              </label>
            </div>
            ${window.LocalApi ? '<p class="muted small">公開版では、アカウントと学習記録はこのブラウザの中にだけ保存されます。</p>' : ""}
            <p class="form-error" id="auth-error" hidden></p>
            <button class="btn primary lg block" type="submit" id="auth-submit">ログイン</button>
          </form>
        </section>
      </div>`;
    const form = $("#auth-form");
    $$("[data-mode]", form).forEach((b) => b.addEventListener("click", () => {
      mode = b.dataset.mode;
      $$("[data-mode]", form).forEach((x) => x.classList.toggle("on", x === b));
      $(".signup-only", form).hidden = mode !== "signup";
      $("#auth-submit").textContent = mode === "signup" ? "登録してはじめる" : "ログイン";
      form.password.autocomplete = mode === "signup" ? "new-password" : "current-password";
      $("#auth-error").hidden = true;
    }));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const body = Object.fromEntries(f.entries());
      const btn = $("#auth-submit");
      btn.disabled = true;
      try {
        await api(mode === "signup" ? "/api/signup" : "/api/login", { method: "POST", body });
        await loadBase();
        location.hash = "#/";
        router();
      } catch (err) {
        const box = $("#auth-error");
        box.textContent = err.message;
        box.hidden = false;
      } finally { btn.disabled = false; }
    });
  }

  // ---------- 画面: ホーム ----------
  function viewHome() {
    const stops = tourStops();
    const next = nextStop();
    const done = stampCount();
    const prev = [...stops].reverse().find((c) => me.stamps[c.id]);
    const rc = next || COUNTRIES[0];
    const pick = (cat) => {
      const list = rc.trips.filter((t) => t.category === cat);
      return { ...(list.find((t) => !isDone("read", t.id)) || list[0]), country: rc };
    };
    const last = me.history[0];
    const totalQ = me.history.reduce((a, h) => a + h.total, 0);
    const totalOk = me.history.reduce((a, h) => a + h.correct, 0);
    const now = new Date();
    const lastHref = last ? (last.kind === "read" ? `#/read/${last.id}` : `#/listen/${last.id}`) : "";

    return {
      nav: "home", title: "ホーム",
      html: `
        <section class="hello">
          <div>
            <p class="eyebrow">${now.getMonth() + 1}月${now.getDate()}日（${"日月火水木金土"[now.getDay()]}）</p>
            <h1>${esc(me.user.name)}さん、こんにちは</h1>
            <p class="muted">${next ? `次の目的地は${esc(next.name)}です。` : "6か国すべてのスタンプが集まりました。"}</p>
          </div>
          ${streakChip()}
        </section>

        <section class="pass">
          <div class="pass-main">
            <p class="pass-label">WORLD TOUR</p>
            <div class="pass-route">
              <div><span class="pass-code">${prev ? prev.code : "JP"}</span><span class="pass-city">${prev ? esc(prev.name) : "日本"}</span></div>
              <div class="pass-plane">${icon("plane", 22)}</div>
              <div><span class="pass-code">${next ? next.code : "JP"}</span><span class="pass-city">${next ? esc(next.name) : "日本"}</span></div>
            </div>
            <div class="pass-progress">${stops.map((c) => `<span class="${me.stamps[c.id] ? "on" : ""} ${next && c.id === next.id ? "now" : ""}" title="${esc(c.name)}"></span>`).join("")}</div>
            <p class="pass-note">${done}/${stops.length}か国${next ? `。${esc(next.name)}の記事かニュースで6割以上正解するとスタンプが押されます。` : "。世界一周を達成しました。"}</p>
          </div>
          <div class="pass-stub">
            <p class="pass-label">STAMPS</p>
            <p class="pass-big">${done}<small>/${stops.length}</small></p>
            <a class="btn accent block" href="${next ? `#/country/${next.id}` : "#/tour"}">${next ? `${esc(next.name)}へ` : "旅の記録"}</a>
          </div>
        </section>

        ${last ? `
        <section class="continue card">
          <div class="continue-ic">${icon(last.kind === "read" ? "read" : "headphones", 22)}</div>
          <div class="grow"><p class="muted small">前回の学習</p><p><strong>${esc(last.title)}</strong>　${last.correct}/${last.total}問正解</p></div>
          <a class="btn ghost sm" href="${lastHref}">もう一度</a>
        </section>` : ""}

        <section>
          <div class="sec-head"><h2>${esc(rc.name)}を学ぶ</h2><a class="link" href="#/map">ほかの国を選ぶ</a></div>
          <div class="grid-3">${tripCard(pick("sight"))}${tripCard(pick("culture"))}${newsCard(rc)}</div>
        </section>

        <section class="stats">
          <div class="stat"><span class="stat-label">正答率</span><strong>${totalQ ? Math.round((totalOk / totalQ) * 100) : "–"}<small>${totalQ ? "%" : ""}</small></strong></div>
          <div class="stat"><span class="stat-label">学習回数</span><strong>${me.history.length}<small>回</small></strong></div>
          <div class="stat"><span class="stat-label">単語帳</span><strong>${me.wordCount}<small>語</small></strong></div>
        </section>`,
      mount: hydrateImages
    };
  }

  // ---------- 画面: 地図 ----------
  let map = null;
  function destroyMap() { if (map) { map.remove(); map = null; } }
  // OSM 標準タイル。公開して利用者が増える場合は、利用規約に沿ったタイル配信サービスに切り替える
  function addTiles(m, maxZoom) {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom
    }).addTo(m);
  }

  function viewMap() {
    return {
      nav: "map", title: "国を選ぶ", wide: true,
      html: `
        <div class="map-layout">
          <div class="map-wrap">
            <div class="region-chips" id="regions">${REGIONS.map((r, i) => `<button class="rchip ${i === 0 ? "on" : ""}" data-r="${r.id}">${r.name}</button>`).join("")}</div>
            <div id="map" class="map">${window.L ? "" : '<p class="map-fallback">地図を読み込めませんでした。一覧から国を選んでください。</p>'}</div>
            <div class="map-sheet" id="map-sheet" hidden></div>
          </div>
          <aside class="country-list">
            <h1 class="h-md">国を選ぶ</h1>
            <p class="muted small">地図のピンか一覧から選んでください。</p>
            <div id="clist">${countryList("all")}</div>
          </aside>
        </div>`,
      mount() {
        const showSheet = (c) => {
          const sheet = $("#map-sheet");
          const n = (cat) => c.trips.filter((t) => t.category === cat).length;
          sheet.hidden = false;
          sheet.innerHTML = `
            <button class="icon-btn sm sheet-x" data-close-sheet aria-label="閉じる">${icon("x", 18)}</button>
            <div class="sheet-row">${codeBadge(c)}<div><h3>${esc(c.name)}</h3><p class="muted small">${esc(c.nameEn)} · 首都 ${esc(c.capital)}</p></div></div>
            <p class="small">${esc(c.desc)}</p>
            <div class="meta-row"><span class="chip blue">${icon("pin", 14)} 観光名所 ${n("sight")}</span><span class="chip purple">${icon("sparkle", 14)} 文化 ${n("culture")}</span><span class="chip orange">${icon("headphones", 14)} ニュース</span>${me.stamps[c.id] ? `<span class="chip green">${icon("check", 14)} スタンプあり</span>` : ""}</div>
            <a class="btn primary block" href="#/country/${c.id}">${esc(c.name)}のページへ</a>`;
          $("[data-close-sheet]", sheet).onclick = () => { sheet.hidden = true; };
        };
        if (window.L) {
          map = L.map("map", { zoomControl: false, worldCopyJump: true, minZoom: 2 }).setView(REGIONS[0].center, REGIONS[0].zoom);
          L.control.zoom({ position: "bottomright" }).addTo(map);
          addTiles(map, 10);
          COUNTRIES.forEach((c) => {
            L.marker([c.lat, c.lng], {
              icon: L.divIcon({ className: "", html: `<div class="pin ${me.stamps[c.id] ? "got" : ""}" style="--c:${c.color}"><span>${c.code}</span></div>`, iconSize: [44, 52], iconAnchor: [22, 50] })
            }).addTo(map).on("click", () => { showSheet(c); map.flyTo([c.lat, c.lng], Math.max(map.getZoom(), 4), { duration: 0.6 }); });
          });
        }
        $("#regions").addEventListener("click", (e) => {
          const b = e.target.closest(".rchip");
          if (!b) return;
          $$(".rchip").forEach((x) => x.classList.toggle("on", x === b));
          const r = REGIONS.find((x) => x.id === b.dataset.r);
          if (map) map.flyTo(r.center, r.zoom, { duration: 0.8 });
          $("#clist").innerHTML = countryList(r.id);
          $("#map-sheet").hidden = true;
        });
      }
    };
  }
  function countryList(region) {
    return COUNTRIES.filter((c) => region === "all" || c.region === region).map((c) => `
      <a class="clist-item" href="#/country/${c.id}">
        ${codeBadge(c)}
        <div class="grow"><strong>${esc(c.name)}</strong><span class="muted small">${esc(c.trips.map((t) => t.name).join("・"))}</span></div>
        ${me.stamps[c.id] ? `<span class="got-ic" title="スタンプあり">${icon("stamp", 20)}</span>` : `<span class="chev">›</span>`}
      </a>`).join("");
  }

  // ---------- 画面: 国の詳細 ----------
  function viewCountry(id) {
    const c = countryById(id);
    if (!c) return null;
    const tourIdx = tourStops().indexOf(c);
    const section = (cat, title, sub = "") => `
      <section>
        <div class="sec-head"><h2>${icon(CATEGORY[cat].icon, 20)} ${title}</h2>${sub ? `<span class="muted small">${sub}</span>` : ""}</div>
        <div class="grid-2">${c.trips.filter((t) => t.category === cat).map((t) => tripCard({ ...t, country: c })).join("")}</div>
      </section>`;
    return {
      nav: "map", title: c.name, back: "#/map",
      html: `
        <section class="c-hero" style="--c:${c.color}">
          <div class="c-hero-media" data-img="${esc(c.trips[0].img)}" data-size="lg"></div>
          <div class="c-hero-text">
            <div class="meta-row">${codeBadge(c)}${tourIdx >= 0 ? `<span class="chip glass">世界一周 ${tourIdx + 1}か国目</span>` : ""}${me.stamps[c.id] ? `<span class="chip glass">${icon("stamp", 14)} スタンプあり</span>` : ""}</div>
            <h1>${esc(c.name)}</h1>
            <p class="en">${esc(c.nameEn)}</p>
          </div>
        </section>

        <section class="c-info">
          <div class="card">
            <div class="sec-head"><h2>基本情報</h2><a class="muted small" id="wiki-link" target="_blank" rel="noopener">出典: Wikipedia</a></div>
            <p id="wiki-extract" class="lead">${esc(c.desc)}</p>
          </div>
          <div class="card facts">
            <div><span class="muted small">首都</span><strong>${esc(c.capital)}</strong></div>
            <div><span class="muted small">言語</span><strong>${esc(c.language)}</strong></div>
            <div><span class="muted small">通貨</span><strong>${esc(c.currency)}</strong></div>
            <div class="phrase"><span class="muted small">現地のひとこと</span><strong class="en">${esc(c.phrase.local)}</strong><span class="small">${esc(c.phrase.ja)}</span></div>
          </div>
        </section>

        ${section("sight", "観光名所を英語で読む")}
        ${section("culture", "文化を英語で読む", "食・習慣・暮らし")}

        <section>
          <div class="sec-head"><h2>${icon("headphones", 20)} ニュースを聴く</h2></div>
          <div class="grid-2">${newsCard(c)}
            <div class="card tip">
              <p class="eyebrow">スタンプ</p>
              <p>この国の記事かニュースで<strong>6割以上</strong>正解すると、パスポートにスタンプが押されます。</p>
            </div>
          </div>
        </section>`,
      mount(root) {
        hydrateImages(root);
        api(`/api/countries/${c.id}/info`).then((d) => {
          const el = $("#wiki-extract");
          if (!el) return;
          el.textContent = d.extract.length > 280 ? d.extract.slice(0, 280) + "…" : d.extract;
          if (d.url) $("#wiki-link").href = d.url;
        }).catch(() => {});
      }
    };
  }

  // ---------- 学習画面の共通部品 ----------
  function questionsHTML(qs) {
    return qs.map((q, qi) => `
      <div class="q" data-q="${qi}">
        <p class="q-title"><span class="q-num">Q${qi + 1}</span><span class="en">${esc(q.q)}</span></p>
        <div class="choices">
          ${q.choices.map((ch, i) => `<button class="choice" data-i="${i}"><span class="ck">${LETTERS[i]}</span><span class="en">${esc(ch)}</span></button>`).join("")}
        </div>
        ${q.hint ? `<div class="q-foot"><button class="hint-btn" data-hint>${icon("bulb", 16)} ヒント</button></div><p class="hint" hidden>${esc(q.hint)}</p>` : ""}
        <div class="fb" hidden></div>
      </div>`).join("");
  }
  function bindQuestions(root, qs, st) {
    $$(".q", root).forEach((qel) => {
      const qi = +qel.dataset.q;
      qel.addEventListener("click", (e) => {
        if (st.graded) return;
        const ch = e.target.closest(".choice");
        if (ch) {
          st.answers[qi] = +ch.dataset.i;
          $$(".choice", qel).forEach((b) => b.classList.toggle("selected", b === ch));
          qel.classList.remove("need");
          const n = st.answers.filter((a) => a !== undefined).length;
          $$("[data-count]", root).forEach((el) => (el.textContent = `${n}/${qs.length}`));
        }
        if (e.target.closest("[data-hint]")) {
          const h = $(".hint", qel);
          if (h.hidden) { h.hidden = false; st.hints++; }
        }
      });
    });
  }
  function showQuestionFeedback(root, results) {
    $$(".q", root).forEach((qel) => {
      const r = results[+qel.dataset.q];
      qel.classList.add(r.ok ? "is-ok" : "is-ng");
      $$(".choice", qel).forEach((b) => {
        const i = +b.dataset.i;
        b.disabled = true;
        if (i === r.answer) b.classList.add("correct");
        else if (i === r.chosen) b.classList.add("wrong");
      });
      const fb = $(".fb", qel);
      fb.hidden = false;
      fb.innerHTML = `<span class="fb-badge ${r.ok ? "ok" : "ng"}">${icon(r.ok ? "check" : "x", 14)} ${r.ok ? "正解" : "不正解"}</span>${r.explain ? `<p>${esc(r.explain)}</p>` : ""}`;
    });
  }

  function resultHTML(res, c, hints) {
    const pct = Math.round((res.correct / res.total) * 100);
    const head = res.correct === res.total ? "全問正解です" : `${res.total}問中${res.correct}問正解`;
    const next = nextStop();
    const s = res.summary;
    return `
      <div class="card result">
        <div class="ring" style="--p:${pct}"><div><strong>${res.correct}</strong><small>/${res.total}</small></div></div>
        <div class="grow">
          <h3>${head}</h3>
          <p class="muted small">正答率 ${pct}%　ヒント ${hints}回${s ? `　要約 ${s.score}点` : ""}</p>
          ${res.stamp.new ? `<p class="stamp-line">${icon("stamp", 16)} ${esc(c.name)}のスタンプを押しました</p>` : !res.stamp.date ? `<p class="small">6割以上の正解でスタンプが押されます。</p>` : ""}
        </div>
      </div>
      ${s ? `
      <div class="card ai-fb">
        <div class="ai-head">${icon("read", 18)}<strong>要約の講評</strong><span class="chip">${s.by === "ai" ? "Gemini で採点" : "キーワードで採点"}</span></div>
        ${s.hit.length || s.miss.length ? `<div class="kw-row">${s.hit.map((k) => `<span class="kw-chip ok">${icon("check", 12)} ${esc(k)}</span>`).join("")}${s.miss.map((k) => `<span class="kw-chip ng">${esc(k)}</span>`).join("")}</div>` : ""}
        ${s.good.length ? `<div><p class="fb-label ok">よかった点</p><ul>${s.good.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
        ${s.improve.length ? `<div><p class="fb-label">直すとよい点</p><ul>${s.improve.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
        ${s.rewrite ? `<div><p class="fb-label">書き直し例</p><p class="en model">${esc(s.rewrite)}</p></div>` : ""}
        <details><summary>模範要約を見る</summary><p class="en model">${esc(s.model)}</p></details>
      </div>` : ""}
      <div class="result-actions">
        <button class="btn ghost" data-retry>もう一度</button>
        <a class="btn ghost" href="#/country/${c.id}">${esc(c.name)}に戻る</a>
        ${next && next.id !== c.id ? `<a class="btn primary" href="#/country/${next.id}">${icon("plane", 16)} 次は${esc(next.name)}</a>` : `<a class="btn primary" href="#/tour">世界一周を見る</a>`}
      </div>`;
  }

  async function finish(root, res, c, st) {
    showQuestionFeedback(root, res.results);
    await refreshMe().catch(() => {});
    const box = $("#result", root);
    box.innerHTML = resultHTML(res, c, st.hints);
    $("[data-retry]", box).onclick = () => router();
    $("#grade", root).hidden = true;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    if (res.stamp.new) setTimeout(() => stampModal(c, res.stamp.date), 500);
  }

  function stampModal(c, d) {
    openModal(`
      <div class="stamp-modal">
        <p class="eyebrow">PASSPORT</p>
        <div class="big-stamp" style="--c:${c.color}"><span class="bs-code">${c.code}</span><span class="bs-name">${esc(c.nameEn.toUpperCase())}</span><span class="bs-date">${fmtDate(d)}</span></div>
        <h2>${esc(c.name)}のスタンプ</h2>
        <p class="muted">世界一周 ${stampCount()}/${tourStops().length}か国</p>
        <button class="btn primary block" data-close>閉じる</button>
      </div>`);
  }

  function studyTabs(labelA, iconA, total) {
    return `
      <div class="seg mobile-only" role="tablist">
        <button class="on" data-tab="main">${icon(iconA, 16)} ${labelA}</button>
        <button data-tab="side">問題 <span class="count" data-count>0/${total}</span></button>
      </div>`;
  }
  function bindTabs(root) {
    $$("[data-tab]", root).forEach((b) => b.addEventListener("click", () => setTab(root, b.dataset.tab)));
    const go = $("[data-goto-side]", root);
    if (go) go.onclick = () => setTab(root, "side");
  }
  function setTab(root, tab) {
    $$("[data-tab]", root).forEach((x) => x.classList.toggle("on", x.dataset.tab === tab));
    root.querySelector(".study").dataset.tab = tab;
    window.scrollTo({ top: 0 });
  }
  function requireAll(root, qs, st) {
    const missing = qs.map((_, i) => i).filter((i) => st.answers[i] === undefined);
    if (!missing.length) return true;
    missing.forEach((i) => $(`.q[data-q="${i}"]`, root).classList.add("need"));
    setTab(root, "side");
    $(`.q[data-q="${missing[0]}"]`, root).scrollIntoView({ behavior: "smooth", block: "center" });
    toast(`まだ答えていない問題があります（Q${missing.map((i) => i + 1).join("、Q")}）`);
    return false;
  }

  // ---------- 画面: リーディング ----------
  async function viewRead(id, fresh = false) {
    const t = tripById(id);
    if (!t) return null;
    const c = t.country;
    const lesson = await api(`/api/trips/${t.id}/lesson${fresh ? "?new=1" : ""}`);
    const qs = lesson.questions;
    const kw = new Set(lesson.keywords);
    const st = { answers: [], hints: 0, graded: false, lang: "en" };
    return {
      nav: "map", title: "リーディング", back: `#/country/${c.id}`, focus: true,
      html: `
        ${studyTabs("記事", "read", qs.length)}
        <div class="study" data-tab="main">
          <div class="study-main">
            <article class="card article" data-source="${esc(t.name)}">
              <div class="article-media" data-img="${esc(t.img)}" data-size="lg" style="--c:${c.color}"></div>
              <div class="article-pad">
                <div class="meta-row">${codeBadge(c, "sm")}${catChip(t)}<span class="chip">${lesson.level}</span><span class="muted small">${esc(t.name)}（${esc(t.city)}）</span></div>
                <h1 class="article-title en">${esc(lesson.article.title)}</h1>
                <div class="article-tools">
                  <span class="tool-hint">${icon("bulb", 16)} 単語をタップすると意味が出ます</span>
                  <div class="tool-group">
                    <button class="tool" data-font="-1" aria-label="文字を小さく">A−</button>
                    <button class="tool" data-font="1" aria-label="文字を大きく">A＋</button>
                    <button class="tool" id="kw-toggle" aria-pressed="true">重要語</button>
                    <button class="tool" id="tts">${icon("volume", 16)} 読み上げ</button>
                  </div>
                </div>
                <div class="article-body en" id="article-body">
                  ${lesson.article.paragraphs.map((p) => `<p>${tokenize(p, kw)}</p>`).join("")}
                </div>
                <div class="credit-row">
                  <p class="credit">${lesson.source === "gemini" ? `Wikipedia「${esc(t.wiki.replace(/_/g, " "))}」をもとに学習用に書き直した文章です。` : "学習用に書き下ろした文章です。"}画像: Wikimedia Commons</p>
                  ${lesson.canRegenerate ? `<button class="tool" id="regen">${icon("refresh", 15)} 別の文章で解く</button>` : ""}
                </div>
              </div>
            </article>

            <section class="card memo">
              <div class="memo-head">
                <div><p class="eyebrow">TRAVEL MEMO</p><h2>旅のメモ</h2></div>
                <button class="btn ghost sm want-btn ${isWanted(t.id) ? "on" : ""}" id="want" aria-pressed="${isWanted(t.id)}">${icon("heart", 16)} 行きたい</button>
              </div>
              <div class="memo-facts">
                <div><span class="muted small">場所</span><strong>${icon("pin", 15)} ${esc(t.city)}（${esc(c.name)}）</strong></div>
                <div><span class="muted small">ジャンル</span><strong>${CATEGORY[t.category].label}</strong></div>
              </div>
              <p class="memo-tip">${icon("bulb", 18)}<span>${esc(t.tip)}</span></p>
              <p class="muted small">「行きたい」を押した場所は、マイページの行きたいリストにまとまります。</p>
            </section>
            <button class="btn primary block mobile-only" data-goto-side>問題に進む</button>
          </div>

          <aside class="study-side">
            <div class="card panel">
              <div class="panel-head"><h2>4択問題</h2><span class="count" data-count>0/${qs.length}</span></div>
              ${questionsHTML(qs)}
            </div>
            <div class="card panel">
              <div class="panel-head"><h2>要約</h2>
                <div class="mini-toggle" id="sum-lang"><button class="on" data-l="en">English</button><button data-l="ja">日本語</button></div>
              </div>
              <p class="muted small" id="sum-guide">記事の内容を英語で1〜2文にまとめてください。</p>
              <textarea id="summary" rows="4" class="en" placeholder="This article is about ..."></textarea>
              <div class="ta-foot"><span class="muted small" id="sum-len">0 words</span><span class="muted small">空欄のままでも採点できます</span></div>
            </div>
            <button class="btn accent lg block" id="grade">採点する</button>
            <div id="result"></div>
          </aside>
        </div>`,
      mount(root) {
        hydrateImages(root);
        bindTabs(root);
        bindQuestions(root, qs, st);

        const regen = $("#regen", root);
        if (regen) regen.onclick = () => renderAsync(() => viewRead(id, true), "新しい文章と問題を作っています。20秒ほどかかることがあります。");

        $("#want", root).addEventListener("click", async (e) => {
          const btn = e.currentTarget;
          try {
            const r = await api(`/api/wants/${t.id}`, { method: "POST" });
            me.wants = r.wanted ? [t.id, ...me.wants] : me.wants.filter((x) => x !== t.id);
            btn.classList.toggle("on", r.wanted);
            btn.setAttribute("aria-pressed", String(r.wanted));
            toast(r.wanted ? `「${t.name}」を行きたいリストに入れました` : "行きたいリストから外しました");
          } catch (err) { toast(err.message); }
        });

        let fs = 0;
        const body = $("#article-body", root);
        $$("[data-font]", root).forEach((b) => b.addEventListener("click", () => {
          fs = Math.max(-2, Math.min(3, fs + +b.dataset.font));
          body.style.setProperty("--fs", fs);
        }));
        $("#kw-toggle", root).addEventListener("click", (e) => {
          const off = body.classList.toggle("no-kw");
          e.currentTarget.setAttribute("aria-pressed", String(!off));
        });

        const ttsBtn = $("#tts", root);
        Speech.load(lesson.article.paragraphs.join(" "));
        Speech.onChange = () => { ttsBtn.innerHTML = `${icon(Speech.playing ? "pause" : "volume", 16)} ${Speech.playing ? "停止" : "読み上げ"}`; ttsBtn.classList.toggle("on", Speech.playing); };
        ttsBtn.addEventListener("click", () => (Speech.playing ? Speech.pause() : Speech.play()));

        const ta = $("#summary", root);
        const updLen = () => {
          const v = ta.value.trim();
          $("#sum-len", root).textContent = st.lang === "en" ? `${v ? v.split(/\s+/).length : 0} words` : `${v.length}文字`;
        };
        ta.addEventListener("input", updLen);
        $("#sum-lang", root).addEventListener("click", (e) => {
          const b = e.target.closest("[data-l]");
          if (!b || st.graded) return;
          st.lang = b.dataset.l;
          $$("#sum-lang button", root).forEach((x) => x.classList.toggle("on", x === b));
          $("#sum-guide", root).textContent = st.lang === "en" ? "記事の内容を英語で1〜2文にまとめてください。" : "日本語で要点をまとめてください。慣れてきたら英語で書いてみてください。";
          ta.classList.toggle("en", st.lang === "en");
          ta.placeholder = st.lang === "en" ? "This article is about ..." : "この記事は…について書かれている。";
          updLen();
        });

        $("#grade", root).addEventListener("click", async () => {
          if (!requireAll(root, qs, st)) return;
          const btn = $("#grade", root);
          btn.disabled = true;
          btn.innerHTML = `<span class="spinner"></span> 採点しています`;
          try {
            const res = await api(`/api/lessons/${lesson.id}/grade`, { method: "POST", body: { answers: st.answers, summary: ta.value, lang: st.lang } });
            st.graded = true;
            ta.readOnly = true;
            await finish(root, res, c, st);
          } catch (err) {
            toast(err.message);
            btn.disabled = false;
            btn.textContent = "採点する";
          }
        });
      }
    };
  }

  // ---------- 画面: リスニング ----------
  async function viewListen(id, fresh = false) {
    const c = countryById(id);
    if (!c) return null;
    const n = await api(`/api/countries/${c.id}/news${fresh ? "?new=1" : ""}`);
    const qs = n.questions;
    const kw = new Set(n.keywords);
    const st = { answers: [], hints: 0, graded: false };
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const video = n.video;

    const player = video ? `
      <div class="player card">
        <div class="screen yt"><iframe src="https://www.youtube-nocookie.com/embed/${esc(video.id)}?rel=0&hl=ja" title="${esc(video.title)}" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
        <div class="controls"><span class="small grow">${esc(video.channel)}　${esc(video.published)}</span>
          ${n.canRegenerate ? `<button class="tool" id="regen">${icon("refresh", 15)} 別のニュース</button>` : ""}</div>
      </div>` : `
      <div class="player card" id="player">
        <div class="screen" style="--c:${c.color}">
          <div class="screen-bg" data-img="${esc(c.trips[0].img)}" data-size="lg"></div>
          <span class="live-tag">NEWS</span>
          <span class="screen-src">${codeBadge(c, "sm")} 練習用ニュース</span>
          <button class="play-big" id="play-big" aria-label="再生">${icon("play", 34)}</button>
          <div class="caption" id="caption" hidden></div>
          <div class="lower-third"><span>${esc(c.name)}</span><strong class="en">${esc(n.headline)}</strong></div>
        </div>
        <div class="controls">
          <button class="icon-btn" id="pp" aria-label="再生">${icon("play", 20)}</button>
          <div class="track" id="track"><div class="track-fill" id="fill"></div></div>
          <span class="time" id="time">0:00</span>
          <select id="rate" aria-label="再生速度"><option value="0.75">0.75x</option><option value="1" selected>1.0x</option><option value="1.25">1.25x</option></select>
          <button class="icon-btn" id="cc" aria-pressed="false" aria-label="字幕">${icon("cc", 20)}</button>
        </div>
      </div>
      <p class="muted small player-note">練習用に作ったニュース原稿を、ブラウザの音声で読み上げています。</p>`;

    return {
      nav: "map", title: "リスニング", back: `#/country/${c.id}`, focus: true,
      html: `
        ${studyTabs(video ? "動画" : "音声", "headphones", qs.length)}
        <div class="study" data-tab="main">
          <section class="study-main">
            ${player}
            <div class="card sum-card">
              <div class="panel-head"><h2>ニュースの要約</h2>
                <div class="mini-toggle" id="nsum-lang"><button class="on" data-l="ja">日本語</button><button data-l="en">English</button></div>
              </div>
              <div class="sum-body blurred" id="nsum"><p id="nsum-text">${esc(n.summaryJa)}</p><button class="btn ghost sm reveal" id="reveal">タップして表示</button></div>
              <p class="muted small">聞き取れなかったときは、要約で内容をつかんでからもう一度聴いてみてください。</p>
            </div>
            <details class="card transcript" data-source="${esc(n.headline)}">
              <summary>${video ? "話している内容（英文）" : "スクリプト（英文）"}</summary>
              <p class="en">${tokenize(n.script, kw)}</p>
            </details>
            <button class="btn primary block mobile-only" data-goto-side>問題に進む</button>
          </section>

          <aside class="study-side">
            <div class="card panel">
              <div class="panel-head"><h2>リスニング問題</h2><span class="count" data-count>0/${qs.length}</span></div>
              ${questionsHTML(qs)}
            </div>
            <button class="btn accent lg block" id="grade">採点する</button>
            <div id="result"></div>
          </aside>
        </div>`,
      mount(root) {
        hydrateImages(root);
        bindTabs(root);
        bindQuestions(root, qs, st);
        const regen = $("#regen", root);
        if (regen) regen.onclick = () => renderAsync(() => viewListen(id, true), "ニュース動画を探して問題を作っています。30秒ほどかかることがあります。");

        if (!video) {
          Speech.load(n.script);
          let ccOn = false;
          let timer = null;
          const total = Speech.totalSec();
          const ui = () => {
            const playing = Speech.playing;
            $("#pp", root).innerHTML = icon(playing ? "pause" : "play", 20);
            $("#player", root).classList.toggle("is-playing", playing);
            const el = Speech.elapsedSec();
            const ended = !playing && Speech.idx >= Speech.sentences.length;
            $("#fill", root).style.width = `${ended ? 100 : Math.min(100, (el / total) * 100)}%`;
            $("#time", root).textContent = `${fmt(ended ? total : el)} / ${fmt(total)}`;
            const cap = $("#caption", root);
            cap.hidden = !ccOn || !playing;
            cap.textContent = Speech.sentences[Speech.idx] || "";
          };
          Speech.onChange = () => {
            ui();
            clearInterval(timer);
            if (Speech.playing) timer = setInterval(ui, 200);
          };
          ui();
          const toggle = () => (Speech.playing ? Speech.pause() : Speech.play());
          $("#pp", root).onclick = toggle;
          $("#play-big", root).onclick = toggle;
          $("#rate", root).onchange = (e) => Speech.setRate(+e.target.value);
          $("#cc", root).onclick = (e) => {
            ccOn = !ccOn;
            e.currentTarget.classList.toggle("on", ccOn);
            e.currentTarget.setAttribute("aria-pressed", String(ccOn));
            toast(ccOn ? "英語字幕を表示します" : "英語字幕を消しました");
            ui();
          };
          $("#track", root).onclick = (e) => {
            const r = e.currentTarget.getBoundingClientRect();
            Speech.seek((e.clientX - r.left) / r.width);
          };
        }

        $("#reveal", root).onclick = () => $("#nsum", root).classList.remove("blurred");
        $("#nsum-lang", root).addEventListener("click", (e) => {
          const b = e.target.closest("[data-l]");
          if (!b) return;
          $$("#nsum-lang button", root).forEach((x) => x.classList.toggle("on", x === b));
          const p = $("#nsum-text", root);
          p.textContent = b.dataset.l === "ja" ? n.summaryJa : n.summaryEn;
          p.classList.toggle("en", b.dataset.l === "en");
        });

        $("#grade", root).addEventListener("click", async () => {
          if (!requireAll(root, qs, st)) return;
          const btn = $("#grade", root);
          btn.disabled = true;
          btn.innerHTML = `<span class="spinner"></span> 採点しています`;
          try {
            const res = await api(`/api/news/${n.id}/grade`, { method: "POST", body: { answers: st.answers } });
            st.graded = true;
            Speech.pause();
            $("#nsum", root).classList.remove("blurred");
            await finish(root, res, c, st);
          } catch (err) {
            toast(err.message);
            btn.disabled = false;
            btn.textContent = "採点する";
          }
        });
      }
    };
  }

  // ---------- 画面: 世界一周 ----------
  function viewTour() {
    const stops = tourStops();
    const next = nextStop();
    return {
      nav: "tour", title: "世界一周",
      html: `
        <div class="sec-head"><div><h1 class="h-md">世界一周</h1><p class="muted small">${stops.length}か国のスタンプを集めるとゴールです。各国の記事かニュースで6割以上正解するとスタンプが押されます。</p></div>
          <span class="streak">${icon("stamp", 18)}<strong>${stampCount()}</strong>/${stops.length}</span></div>
        <div class="tour-layout">
          <div class="card tour-map-card"><div id="tour-map" class="map small-map">${window.L ? "" : '<p class="map-fallback">地図を読み込めませんでした</p>'}</div></div>
          <ol class="route">
            ${stops.map((c, i) => {
              const got = !!me.stamps[c.id];
              const now = next && next.id === c.id;
              return `
              <li class="stop ${got ? "got" : ""} ${now ? "now" : ""}">
                <span class="stop-dot">${got ? icon("check", 16) : i + 1}</span>
                <div class="stop-card card">
                  <div class="sheet-row">${codeBadge(c)}<div class="grow"><h3>${esc(c.name)}</h3><p class="muted small">${esc(c.trips.map((t) => t.name).join("・"))}</p></div>
                  ${got ? `<span class="chip green">${icon("stamp", 14)} ${fmtDate(me.stamps[c.id])}</span>` : now ? `<span class="chip orange">次の目的地</span>` : ""}</div>
                  ${now ? `<a class="btn primary sm" href="#/country/${c.id}">${icon("plane", 16)} ${esc(c.name)}へ</a>` : `<a class="link small ${got ? "" : "muted"}" href="#/country/${c.id}">${got ? "もう一度学ぶ" : "先に見る"}</a>`}
                </div>
              </li>`;
            }).join("")}
            <li class="stop goal ${next ? "" : "got"}"><span class="stop-dot">★</span><div class="stop-card card"><h3>ゴール</h3><p class="muted small">${stops.length}か国すべてのスタンプを集めると達成です。</p></div></li>
          </ol>
        </div>`,
      mount() {
        if (!window.L) return;
        map = L.map("tour-map", { zoomControl: false, scrollWheelZoom: false }).setView([20, 40], 1);
        addTiles(map, 6);
        // 東回りにつなぐため、西半球の国は経度に 360 を足して右側に描く
        const pts = stops.map((c) => [c.lat, c.lng < -30 ? c.lng + 360 : c.lng]);
        L.polyline(pts, { color: "#1e4d7b", weight: 2.5, dashArray: "6 8", opacity: 0.8 }).addTo(map);
        stops.forEach((c, i) => {
          L.marker(pts[i], { icon: L.divIcon({ className: "", html: `<div class="pin sm ${me.stamps[c.id] ? "got" : ""}" style="--c:${c.color}"><span>${i + 1}</span></div>`, iconSize: [32, 38], iconAnchor: [16, 36] }) })
            .addTo(map).on("click", () => { location.hash = `#/country/${c.id}`; });
        });
        map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
      }
    };
  }

  // ---------- 画面: 単語帳 ----------
  async function viewWords() {
    const ws = await api("/api/words");
    me.wordCount = ws.length;
    const firstTrip = (nextStop() || COUNTRIES[0]).trips[0];
    return {
      nav: "words", title: "単語帳",
      html: `
        <div class="sec-head"><div><h1 class="h-md">単語帳</h1><p class="muted small">${ws.length}語</p></div>
          ${ws.length ? `<button class="btn primary" id="flash">${icon("book", 16)} カードで復習</button>` : ""}</div>
        ${ws.length ? `
        <div class="card word-list">
          ${ws.map((w) => `
            <div class="word-row">
              <button class="icon-btn sm" data-speak="${esc(w.word)}" aria-label="発音">${icon("volume", 18)}</button>
              <div class="grow"><strong class="en word-en">${esc(w.word)}</strong> ${w.pos ? `<span class="pos">${esc(w.pos)}</span>` : ""}<p class="small">${esc(w.meaning)}</p></div>
              <span class="muted small from">${esc(w.source || "")}</span>
              <button class="icon-btn sm" data-del="${esc(w.word)}" aria-label="削除">${icon("trash", 18)}</button>
            </div>`).join("")}
        </div>` : `
        <div class="empty card">
          <div class="empty-ic">${icon("book", 36)}</div>
          <h2>まだ単語がありません</h2>
          <p class="muted">記事やスクリプトの中でわからない単語をタップすると、意味を調べて保存できます。</p>
          <a class="btn primary" href="#/read/${firstTrip.id}">記事を読む</a>
        </div>`}`,
      mount(root) {
        root.addEventListener("click", async (e) => {
          const sp = e.target.closest("[data-speak]");
          if (sp) speakWord(sp.dataset.speak);
          const del = e.target.closest("[data-del]");
          if (del) {
            try {
              await api(`/api/words/${encodeURIComponent(del.dataset.del)}`, { method: "DELETE" });
              toast(`「${del.dataset.del}」を削除しました`);
              router();
            } catch (err) { toast(err.message); }
          }
        });
        const fl = $("#flash", root);
        if (fl) fl.onclick = () => flashcards(ws);
      }
    };
  }
  function flashcards(words) {
    const deck = [...words].sort(() => Math.random() - 0.5);
    let i = 0;
    const draw = (m) => {
      const w = deck[i];
      $(".flash-body", m).innerHTML = `
        <p class="muted small">${i + 1} / ${deck.length}</p>
        <button class="flash-card" id="fc"><span class="fc-front en">${esc(w.word)}</span><span class="fc-back">${esc(w.meaning)}</span></button>
        <p class="muted small">カードをタップすると意味が出ます</p>
        <div class="result-actions"><button class="btn ghost" data-close>終了</button><button class="btn primary" id="fc-next">${i + 1 < deck.length ? "次へ" : "最初から"}</button></div>`;
      $("#fc", m).onclick = (e) => e.currentTarget.classList.toggle("flip");
      $("#fc-next", m).onclick = () => { i = (i + 1) % deck.length; draw(m); };
    };
    openModal(`<div class="flash-body"></div>`, { onMount: draw });
  }

  // ---------- 画面: マイページ ----------
  function viewMe() {
    const stops = tourStops();
    const wants = me.wants.map(tripById).filter(Boolean);
    return {
      nav: "me", title: "マイページ",
      html: `
        <section class="card profile">
          <div class="avatar">${esc(me.user.name.slice(0, 1))}</div>
          <div class="grow"><h1 class="h-md">${esc(me.user.name)}</h1><p class="muted small">@${esc(me.user.username)}</p></div>
          ${streakChip()}
        </section>

        <section class="card passport">
          <div class="passport-head"><div><p class="eyebrow">PASSPORT</p><h2>スタンプ帳</h2></div><span class="muted small">${stampCount()}/${stops.length}</span></div>
          <div class="stamp-grid">
            ${stops.map((c, i) => me.stamps[c.id]
              ? `<a href="#/country/${c.id}" class="slot got" style="--c:${c.color};--r:${(i % 2 ? 1 : -1) * (4 + i * 2)}deg"><span class="bs-code">${c.code}</span><span class="bs-name">${esc(c.nameEn.toUpperCase())}</span><span class="bs-date">${fmtDate(me.stamps[c.id])}</span></a>`
              : `<a href="#/country/${c.id}" class="slot"><span>${esc(c.name)}</span></a>`).join("")}
          </div>
        </section>

        <section class="card">
          <div class="sec-head"><h2>${icon("heart", 20)} 行きたいリスト</h2><span class="muted small">${wants.length}か所</span></div>
          ${wants.length ? `<ul class="history">${wants.map((t) => `
            <li><span class="h-ic want">${icon("pin", 16)}</span>
              <a class="grow" href="#/read/${t.id}"><strong>${esc(t.name)}</strong><span class="muted small">${esc(t.city)}（${esc(t.country.name)}）・${CATEGORY[t.category].label}</span></a>
              <span class="muted small want-tip">${esc(t.tip.split("。")[0])}。</span></li>`).join("")}</ul>`
            : `<p class="muted small">記事の「旅のメモ」で「行きたい」を押すと、ここに集まります。</p>`}
        </section>

        <section class="card">
          <div class="sec-head"><h2>学習履歴</h2></div>
          ${me.history.length ? `<ul class="history">${me.history.slice(0, 10).map((h) => `
            <li><span class="h-ic ${h.kind}">${icon(h.kind === "read" ? "read" : "headphones", 16)}</span>
              <div class="grow"><strong>${esc(h.title)}</strong><span class="muted small">${esc((countryById(h.country) || {}).name || "")}・${fmtDate(h.at)}</span></div>
              <span class="score ${h.correct / h.total >= 0.6 ? "ok" : ""}">${h.correct}/${h.total}</span></li>`).join("")}</ul>`
            : `<p class="muted small">まだ履歴がありません。</p>`}
        </section>

        <section class="card settings-card">
          <div class="sec-head"><h2>設定</h2></div>
          <div class="setting-row">
            <div class="grow"><strong>英語のレベル</strong><p class="muted small">記事の難しさが変わります（Gemini 連携時）</p></div>
            <div class="mini-toggle" id="level">${["A2", "B1", "B2"].map((l) => `<button data-l="${l}" class="${me.user.level === l ? "on" : ""}">${l}</button>`).join("")}</div>
          </div>
          <div class="setting-row">
            <div class="grow"><strong>外部サービス</strong><p class="muted small">${status.static ? "公開版のため Gemini と YouTube は使っていません。記事と問題は用意した教材を使います。" : `Gemini：${status.gemini ? "接続中" : "未設定"}　YouTube：${status.youtube ? "接続中" : "未設定"}`}</p></div>
          </div>
          <div class="settings">
            <button class="btn ghost" id="logout">ログアウト</button>
            <button class="btn ghost danger" id="reset">学習データを消去</button>
          </div>
        </section>`,
      mount(root) {
        $("#level", root).addEventListener("click", async (e) => {
          const b = e.target.closest("[data-l]");
          if (!b) return;
          try {
            await api("/api/me", { method: "PATCH", body: { level: b.dataset.l } });
            me.user.level = b.dataset.l;
            $$("#level button", root).forEach((x) => x.classList.toggle("on", x === b));
            toast(`レベルを${b.dataset.l}にしました`);
          } catch (err) { toast(err.message); }
        });
        $("#logout", root).onclick = async () => {
          await api("/api/logout", { method: "POST" }).catch(() => {});
          me = null;
          location.hash = "#/login";
        };
        $("#reset", root).onclick = async () => {
          if (!confirm("スタンプ・履歴・単語帳・行きたいリストをすべて消去します。よろしいですか？")) return;
          try {
            await api("/api/me/progress", { method: "DELETE" });
            await refreshMe();
            toast("学習データを消去しました");
            router();
          } catch (err) { toast(err.message); }
        };
      }
    };
  }

  // ---------- シェル ----------
  function renderShell(v) {
    document.body.classList.remove("is-login");
    document.body.classList.toggle("is-focus", !!v.focus);
    $("#app").innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <a class="brand" href="#/">${icon("globe", 26)}<span>TabiYomi</span></a>
          <nav>${NAV.map((n) => `<a href="${n.href}" class="${v.nav === n.key ? "on" : ""}">${icon(n.icon)}<span>${n.label}</span></a>`).join("")}</nav>
          <div class="side-user"><div class="avatar sm">${esc(me.user.name.slice(0, 1))}</div><div><strong>${esc(me.user.name)}</strong><span>スタンプ ${stampCount()}/${tourStops().length}</span></div></div>
        </aside>
        <div class="main-col">
          <header class="topbar">
            ${v.back ? `<a class="icon-btn" href="${v.back}" aria-label="戻る">${icon("back", 22)}</a>` : `<a class="brand sm" href="#/">${icon("globe", 22)}<span>TabiYomi</span></a>`}
            <span class="topbar-title">${v.back ? esc(v.title) : ""}</span>
            ${streakChip("sm")}
          </header>
          ${v.back ? `<div class="crumb desk-only"><a href="${v.back}">${icon("back", 16)} 戻る</a></div>` : ""}
          <main id="view" class="view ${v.wide ? "wide" : ""}">${v.html}</main>
        </div>
        <nav class="tabbar">${NAV.map((n) => `<a href="${n.href}" class="${v.nav === n.key ? "on" : ""}">${icon(n.icon, 22)}<span>${n.label}</span></a>`).join("")}</nav>
      </div>`;
    v.mount && v.mount($("#view"));
  }

  // 非同期で用意する画面。時間がかかるときだけ読み込み中を出す
  let renderToken = 0;
  async function renderAsync(make, waitMsg, shellOpts = {}) {
    const my = ++renderToken;
    Speech.onChange = null;
    Speech.stop();
    destroyMap();
    closePopover();
    const slow = setTimeout(() => {
      if (my === renderToken) renderShell({ nav: "map", title: "", ...shellOpts, html: loading(waitMsg) });
    }, 150);
    try {
      const v = await make();
      clearTimeout(slow);
      if (my !== renderToken) return;
      if (!v) { location.hash = "#/"; return; }
      renderShell(v);
      window.scrollTo(0, 0);
    } catch (err) {
      clearTimeout(slow);
      if (my !== renderToken || err.status === 401) return;
      renderShell({ nav: "home", title: "", ...shellOpts, html: errorBox(err.message) });
    }
  }

  // ---------- ルーター ----------
  const ROUTES = [
    [/^\/$/, viewHome, "読み込んでいます"],
    [/^\/map$/, viewMap, "読み込んでいます"],
    [/^\/country\/(\w+)$/, viewCountry, "読み込んでいます"],
    [/^\/read\/(\w+)$/, viewRead, "記事を準備しています。初めて開く記事は20秒ほどかかることがあります。", { focus: true, title: "リーディング" }],
    [/^\/listen\/(\w+)$/, viewListen, "ニュースを準備しています。30秒ほどかかることがあります。", { focus: true, title: "リスニング" }],
    [/^\/tour$/, viewTour, "読み込んでいます"],
    [/^\/words$/, viewWords, "読み込んでいます", { nav: "words" }],
    [/^\/me$/, viewMe, "読み込んでいます"]
  ];

  async function router() {
    closeModal();
    const path = location.hash.replace(/^#/, "") || "/";
    if (path === "/login") {
      if (me) { location.hash = "#/"; return; }
      renderToken++;
      Speech.onChange = null;
      Speech.stop();
      destroyMap();
      renderLogin();
      return;
    }
    if (!me) {
      try { await loadBase(); } catch (e) {
        if (e.status !== 401) $("#app").innerHTML = `<div class="view">${errorBox(e.message)}</div>`;
        return;
      }
    }
    for (const [re, fn, msg, opts] of ROUTES) {
      const m = path.match(re);
      if (m) {
        renderAsync(() => fn(...m.slice(1)), msg, { back: opts && opts.focus ? "#/map" : undefined, ...opts });
        return;
      }
    }
    location.hash = "#/";
  }
  window.addEventListener("hashchange", router);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePopover(); closeModal(); } });
  router();
})();
