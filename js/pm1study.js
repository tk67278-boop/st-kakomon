/* ST 午後I記述式 学習画面（問題文・演習・対比採点・資料）
   window.PM1Study.open(examId, no) で起動する。
   表示対象データは window.PM1_TEXT[examId].questions から取得する
   （データが無い年度・問については js/pm.js 側が「学習」ボタン自体を出さない）。
   js/pm2study.js の画面遷移・タブ・保存・タイマー・自動保存の流儀に揃えている。 */
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  function $all(elOrSel, sel) {
    var scope = sel ? elOrSel : document;
    var s = sel || elOrSel;
    return Array.prototype.slice.call(scope.querySelectorAll(s));
  }

  var root = $("#pm1-study");
  var pmMain = $("#pm-main");
  if (!root || !pmMain) return; // 想定外のDOM構成の場合は安全に何もしない

  var TABS = [
    { id: "problem", label: "問題文" },
    { id: "exercise", label: "演習" },
    { id: "compare", label: "対比・採点" },
    { id: "material", label: "資料" }
  ];

  var GRADE_OPTIONS = ["◎", "○", "△", "×"];
  var MARKER_RE = /^\{\{(.+)\}\}$/;

  /* ---------- ユーティリティ（js/pm2study.js と同等のものをこのファイル内に複製） ---------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }
  function trimStr(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }
  function charLen(s) {
    // サロゲートペア（絵文字等）も1文字として数える。通常の日本語文章では .length と同じ結果になる
    return s ? Array.from(String(s)).length : 0;
  }
  function fmtDateTime(t) {
    if (!t) return "";
    var d = new Date(t);
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "/" + p2(d.getMonth() + 1) + "/" + p2(d.getDate()) + " " +
      p2(d.getHours()) + ":" + p2(d.getMinutes());
  }
  function fmtClock(sec) {
    if (sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? "0" + m : "" + m) + ":" + (s < 10 ? "0" + s : "" + s);
  }
  function fmtElapsed(sec) {
    sec = Math.max(0, sec || 0);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + "分" + (s < 10 ? "0" + s : "" + s) + "秒";
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve(); else reject(new Error("execCommand failed"));
      } catch (e) { reject(e); }
    });
  }
  function flashText(el, msg, restoreMs) {
    if (!el) return;
    var original = el.textContent;
    el.textContent = msg;
    setTimeout(function () { if (el) el.textContent = original; }, restoreMs || 1500);
  }
  function copyAnsMap(map) {
    var out = {};
    Object.keys(map || {}).forEach(function (k) { out[k] = map[k]; });
    return out;
  }

  /* ---------- 同期の状態確認 (js/sync.js) ---------- */
  function syncActive() {
    return !!(window.STSync && window.STSync.active());
  }

  /* ---------- ドキュメントの既定形・正規化・端末内保存 ---------- */
  function defaultDoc() {
    return {
      ans: { draft: null, versions: [] },
      grades: {},
      overall: "",
      memo: "",
      ai: "",
      hints: {},   // {idx: 開いたヒントの最大段階(1〜3)}
      t: 0
    };
  }
  function normalizeDoc(data) {
    var d = defaultDoc();
    if (!data || typeof data !== "object") return d;
    if (data.ans) {
      if (data.ans.draft && typeof data.ans.draft === "object") d.ans.draft = data.ans.draft;
      if (Array.isArray(data.ans.versions)) d.ans.versions = data.ans.versions;
    }
    if (data.grades && typeof data.grades === "object") d.grades = data.grades;
    if (typeof data.overall === "string") d.overall = data.overall;
    if (typeof data.memo === "string") d.memo = data.memo;
    if (typeof data.ai === "string") d.ai = data.ai;
    if (data.hints && typeof data.hints === "object") d.hints = data.hints;
    if (data.t) d.t = data.t;
    return d;
  }
  function localKey(themeKey) { return "st_pm1doc_" + themeKey; }
  function loadLocalDoc(themeKey) {
    try { return normalizeDoc(JSON.parse(localStorage.getItem(localKey(themeKey)))); }
    catch (e) { return defaultDoc(); }
  }
  function saveLocalDoc(themeKey, doc) {
    try { localStorage.setItem(localKey(themeKey), JSON.stringify(doc)); } catch (e) { /* ignore */ }
  }

  /* ---------- 演習記録（js/pm.js の一覧が読む st_pm_records_v1 と同じストア） ---------- */
  var PM_RECORDS_KEY = "st_pm_records_v1";
  function saveExerciseRecord(key, rec) {
    if (syncActive() && window.STSync.setPmRecord) {
      window.STSync.setPmRecord(key, rec);
      return;
    }
    var records;
    try { records = JSON.parse(localStorage.getItem(PM_RECORDS_KEY)) || {}; }
    catch (e) { records = {}; }
    records[key] = rec;
    try { localStorage.setItem(PM_RECORDS_KEY, JSON.stringify(records)); } catch (e) { /* ignore */ }
  }

  /* ---------- データ参照 ---------- */
  function findExam(examId) {
    var found = null;
    (window.PM_INDEX || []).forEach(function (e) { if (e.examId === examId) found = e; });
    return found;
  }
  function findThemeQuestion(examId, no) {
    var theme = window.PM1_TEXT && window.PM1_TEXT[examId];
    if (!theme || !theme.questions) return null;
    var found = null;
    theme.questions.forEach(function (q) { if (q.no === no) found = q; });
    return found;
  }
  // PM1_TEXTの正式タイトルが未収録（空文字）の場合に備え、js/pm.js の一覧と同じ考え方で
  // window.PM_INDEX の仮題にフォールバックする。
  function displayTitleFor(exam, q) {
    if (q.title) return q.title;
    var pm1 = (exam && exam.pm1) || {};
    var found = null;
    (pm1.questions || []).forEach(function (pq) { if (pq.no === q.no) found = pq; });
    return (found && found.title) || "";
  }
  // 設問・parts を「全設問を通した連番idx」で平坦化する。byIdx の保存キーはこのidxを使う。
  function flatParts(q) {
    var out = [];
    var idx = 0;
    (q.setsumon || []).forEach(function (s) {
      (s.parts || []).forEach(function (p, pi) {
        out.push({ idx: idx, setsumon: s, part: p, isFirstInSetsumon: pi === 0 });
        idx++;
      });
    });
    return out;
  }
  function figureById(q, id) {
    var found = null;
    (q.figures || []).forEach(function (f) { if (f.id === id) found = f; });
    return found;
  }

  /* ---------- 状態（open()のたびに作り直す） ---------- */
  var state = null;

  function newState(examId, no, exam, q) {
    return {
      examId: examId,
      no: no,
      exam: exam,
      q: q,
      flat: flatParts(q),
      themeKey: examId + "#pm1#" + no,
      doc: defaultDoc(),
      useLocalFallback: false,
      activeTab: "problem",
      ansLive: null,       // {idx: text} 演習タブの入力中キャッシュ（タブ切替をまたいで保持）
      ansLiveInit: false,
      autosaveIntervalId: null,
      exTimer: {
        totalSec: 45 * 60,
        remainingSec: 45 * 60,
        endAt: null,
        running: false,
        started: false,
        finished: false,
        intervalId: null
      }
    };
  }

  /* ---------- ドキュメントの読み込み・保存 ---------- */
  function loadDoc(themeKey) {
    if (syncActive()) {
      return window.STSync.loadPm1Doc(themeKey).then(function (data) {
        if (data && data.__error === "denied") {
          state.useLocalFallback = true;
          return loadLocalDoc(themeKey);
        }
        return normalizeDoc(data);
      });
    }
    return Promise.resolve(loadLocalDoc(themeKey));
  }
  function saveDoc() {
    if (!state) return;
    var themeKey = state.themeKey;
    var doc = state.doc;
    if (syncActive() && !state.useLocalFallback) {
      window.STSync.savePm1Doc(themeKey, doc).then(function (result) {
        if (result && result.__error === "denied") {
          state.useLocalFallback = true;
          renderCloudWarning();
          saveLocalDoc(themeKey, doc);
        }
      });
    } else {
      saveLocalDoc(themeKey, doc);
    }
  }
  function renderCloudWarning() {
    var el = $("#pm1-warning");
    if (!el) return;
    if (state && state.useLocalFallback) {
      el.hidden = false;
      el.textContent = "クラウド保存にはFirestoreルールの更新が必要です（README参照）。この端末内には保存されます。";
    } else {
      el.hidden = true;
      el.textContent = "";
    }
  }

  /* =====================================================================
     問題文タブ（本文の段落表示・図表マーカー置換・設問一覧）
     ===================================================================== */
  function renderFigureBlock(fig) {
    if (!fig) return "";
    if (fig.html) {
      return '<div class="pm1-figure-wrap">' +
        '<div class="pm1-figure-label">' + escapeHtml(fig.id) + '</div>' +
        '<div class="q-extra">' + fig.html + '</div>' +
      '</div>';
    }
    if (fig.image) {
      return '<div class="pm1-figure-wrap">' +
        '<div class="pm1-figure-label">' + escapeHtml(fig.id) + '</div>' +
        '<div class="q-image-wrap"><img src="' + escapeAttr(fig.image) + '" alt="' + escapeAttr(fig.id) + '"></div>' +
      '</div>';
    }
    return "";
  }
  // 本文を行単位で走査し、空行区切りを段落として、"{{表1}}"等のマーカー単独行を
  // 図表の実体（figures[].html はエスケープせずそのまま挿入／imageは<img>化）に置換する。
  function renderBodyWithFigures(q) {
    var text = String(q.body || "");
    var lines = text.split("\n");
    var html = "";
    var paraBuf = [];
    function flushPara() {
      if (!paraBuf.length) return;
      var block = paraBuf.join("\n");
      var trimmed = trimStr(block);
      if (trimmed) html += "<p>" + escapeHtml(trimmed).replace(/\n/g, "<br>") + "</p>";
      paraBuf = [];
    }
    lines.forEach(function (line) {
      var m = MARKER_RE.exec(trimStr(line));
      if (m) {
        flushPara();
        html += renderFigureBlock(figureById(q, trimStr(m[1])));
      } else if (trimStr(line) === "") {
        flushPara();
      } else {
        paraBuf.push(line);
      }
    });
    flushPara();
    return html;
  }
  function renderProblemTab(body) {
    var q = state.q;
    var html = '<div class="card"><div class="pm2-lead">' + renderBodyWithFigures(q) + '</div></div>';
    html += (q.setsumon || []).map(function (s) {
      return '<div class="card pm2-setumon-box">' +
        '<div class="group-head"><h2>' + escapeHtml(s.label || "") + '</h2></div>' +
        '<div class="pm2-setumon-body">' + escapeHtml(s.text || "") + '</div>' +
        '<div class="pm1-limit-chips">' +
          (s.parts || []).map(function (p) {
            return '<span class="pm2-limit-label">' + escapeHtml(p.label || "") +
              (p.limit ? "：" + escapeHtml(String(p.limit)) + "字以内" : "：字数指定なし") + '</span>';
          }).join("") +
        '</div>' +
      '</div>';
    }).join("");
    body.innerHTML = html;
  }

  /* =====================================================================
     資料タブ
     ===================================================================== */
  function renderMaterialTab(body) {
    var q = state.q;
    var pm1 = state.exam.pm1 || {};
    var urls = pm1.urls || {};
    body.innerHTML =
      '<div class="card">' +
        '<div class="group-head"><h2>資料PDF</h2></div>' +
        '<div class="pm2-links">' +
          (urls.qs ? '<a href="' + escapeAttr(urls.qs) + '" target="_blank" rel="noopener">問題</a>' : '') +
          (urls.ans ? '<a href="' + escapeAttr(urls.ans) + '" target="_blank" rel="noopener">解答例</a>' : '') +
          (urls.cmnt ? '<a href="' + escapeAttr(urls.cmnt) + '" target="_blank" rel="noopener">講評</a>' : '') +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="group-head"><h2>出題趣旨</h2></div>' +
        '<pre class="pm2-pre">' + escapeHtml(q.shushi || "（未収録）") + '</pre>' +
      '</div>' +
      '<div class="card">' +
        '<div class="group-head"><h2>採点講評</h2></div>' +
        '<pre class="pm2-pre">' + escapeHtml(q.kouhyo || "（未収録）") + '</pre>' +
      '</div>';
  }

  /* =====================================================================
     演習タブ（45分タイマー・字数カウント・自動保存）
     ===================================================================== */
  function ensureAnsLive() {
    if (state.ansLiveInit) return;
    var draft = state.doc.ans.draft || {};
    var live = {};
    state.flat.forEach(function (fp) {
      live[fp.idx] = (typeof draft[fp.idx] === "string") ? draft[fp.idx] : "";
    });
    state.ansLive = live;
    state.ansLiveInit = true;
  }
  function classifyAnsCount(len, limit) {
    if (!limit) return { cls: "muted", text: len + "字" };
    if (len > limit) return { cls: "ng", text: len + "字（" + (len - limit) + "字超過）" };
    return { cls: "ok", text: len + "字" };
  }
  function updateAnsCounter(fp) {
    var counter = $("#pm1-count-" + fp.idx);
    if (!counter || !state.ansLive) return;
    var len = charLen(state.ansLive[fp.idx]);
    var r = classifyAnsCount(len, fp.part.limit);
    counter.textContent = r.text;
    counter.className = "pm2-count " + r.cls;
  }

  function exTimerRemainingSec() {
    var t = state.exTimer;
    return t.running ? Math.max(0, Math.round((t.endAt - Date.now()) / 1000)) : t.remainingSec;
  }
  function exElapsedSec() {
    var t = state.exTimer;
    return t.totalSec - exTimerRemainingSec();
  }
  function updateExTimerDisplay() {
    var disp = $("#pm1-ex-timer-display");
    if (!disp) return;
    disp.textContent = state.exTimer.finished ? "時間終了" : fmtClock(exTimerRemainingSec());
  }
  function updateExTimerButtons() {
    var startBtn = $("#pm1-ex-timer-start");
    if (!startBtn) return;
    var toggleBtn = $("#pm1-ex-timer-toggle");
    var t = state.exTimer;
    var lockedMidRun = t.started && !t.finished;
    startBtn.disabled = lockedMidRun;
    toggleBtn.disabled = !lockedMidRun;
    toggleBtn.textContent = t.running ? "一時停止" : "再開";
  }
  function stopExTimerLoop() {
    var t = state.exTimer;
    if (t.intervalId) { clearInterval(t.intervalId); t.intervalId = null; }
  }
  function startExTimerLoop() {
    stopExTimerLoop();
    var t = state.exTimer;
    if (t.running) t.intervalId = setInterval(exTimerTick, 250);
  }
  function exTimerTick() {
    var t = state.exTimer;
    if (!t.running) return;
    var remain = Math.round((t.endAt - Date.now()) / 1000);
    if (remain <= 0) {
      t.running = false;
      t.finished = true;
      t.remainingSec = 0;
      stopExTimerLoop();
      updateExTimerButtons();
      updateExTimerDisplay();
      return;
    }
    updateExTimerDisplay();
  }
  function startExTimer() {
    var t = state.exTimer;
    if (t.started && !t.finished) return;
    t.remainingSec = t.totalSec;
    t.endAt = Date.now() + t.remainingSec * 1000;
    t.running = true;
    t.started = true;
    t.finished = false;
    startExTimerLoop();
    updateExTimerButtons();
    updateExTimerDisplay();
  }
  function toggleExTimer() {
    var t = state.exTimer;
    if (!t.started || t.finished) return;
    if (t.running) {
      t.remainingSec = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
      t.running = false;
      stopExTimerLoop();
    } else {
      if (t.remainingSec <= 0) return;
      t.endAt = Date.now() + t.remainingSec * 1000;
      t.running = true;
      startExTimerLoop();
    }
    updateExTimerButtons();
    updateExTimerDisplay();
  }
  function resetExTimerClick() {
    var t = state.exTimer;
    stopExTimerLoop();
    t.running = false;
    t.started = false;
    t.finished = false;
    t.remainingSec = t.totalSec;
    t.endAt = null;
    updateExTimerButtons();
    updateExTimerDisplay();
  }

  function startAutosave() {
    stopAutosave();
    state.autosaveIntervalId = setInterval(function () {
      var live = state.ansLive;
      if (!live) return;
      var hasContent = Object.keys(live).some(function (k) { return trimStr(live[k]); });
      if (hasContent) saveDraft();
    }, 30000);
  }
  function stopAutosave() {
    if (state.autosaveIntervalId) { clearInterval(state.autosaveIntervalId); state.autosaveIntervalId = null; }
  }
  function saveDraft() {
    state.doc.ans.draft = copyAnsMap(state.ansLive);
    saveDoc();
  }
  function saveVersionSnapshot() {
    var version = { t: Date.now(), ans: copyAnsMap(state.ansLive), sec: exElapsedSec() };
    state.doc.ans.versions.unshift(version);
    if (state.doc.ans.versions.length > 5) state.doc.ans.versions.length = 5;
    saveDoc();
  }

  /* ---------- 演習画面の表示設定（端末ごとの好み。保存できなくても動作に影響しない） ---------- */
  var PREF_HINT = "st_pm1_hintmode", PREF_RATIO = "st_pm1_ratio";
  function loadPref(key, def) {
    try { var v = localStorage.getItem(key); return v == null ? def : v; } catch (e) { return def; }
  }
  function savePref(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* ignore */ } }

  /* ---------- ヒント1: 設問文から本文の参照先（〔節〕・下線・図表）を読み取る ---------- */
  var CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  // 解答欄に対応する設問文の行（"(2) …" と続く補足行）。小問番号がなければ設問文全体。
  function partQuestionText(fp) {
    var text = String(fp.setsumon.text || "");
    var m = /\((\d+)\)/.exec(String(fp.part.label || ""));
    if (m) {
      var lines = text.split("\n");
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("(" + m[1] + ")") === 0) {
          var out = [lines[i]];
          for (var j = i + 1; j < lines.length && !/^\(\d+\)/.test(lines[j]); j++) out.push(lines[j]);
          return out.join("\n");
        }
      }
    }
    return text;
  }
  function partRefs(fp) {
    var qtext = partQuestionText(fp);
    var sec = /〔([^〕]+)〕/.exec(String(fp.setsumon.text || ""));
    // 下線①・方針①・指摘①など，設問文中で参照される丸数字（行頭の箇条番号は除く）
    var uls = [], m;
    qtext.split("\n").forEach(function (ln) {
      ln.slice(1).split("").forEach(function (c) { if (CIRCLED.indexOf(c) >= 0 && uls.indexOf(c) < 0) uls.push(c); });
    });
    var underline = /下線[①-⑳]/.test(qtext);
    var figs = [];
    var fre = /([表図]\s*\d+)/g;
    while ((m = fre.exec(qtext))) { var f = m[1].replace(/\s/g, ""); if (figs.indexOf(f) < 0) figs.push(f); }
    return { sec: sec ? sec[1] : "", uls: uls, figs: figs, underline: underline };
  }

  /* ---------- ヒント2: 問い方から答え方の型を示す ---------- */
  function answerShapeHint(fp) {
    var t = partQuestionText(fp);
    var tips = [];
    if (/字句/.test(t)) tips.push("空欄に入れる字句を問われている。空欄の前後の文や表の項目名につながる短い語句で答える。");
    else if (/理由/.test(t)) tips.push("理由を問われている。文末を「〜から」「〜ため」で結び，本文中の事実（状況・制約・強みなど）を根拠として書く。");
    else if (/目的|狙い|ねらい/.test(t)) tips.push("目的を問われている。文末を「〜ため」「〜すること」で結び，その施策で何を実現したいのかを書く。");
    else if (/効果/.test(t)) tips.push("効果を問われている。「〜できる」「〜が向上する」の形で，施策によって得られる良い変化を書く。");
    else if (/背景/.test(t)) tips.push("背景を問われている。施策が必要になった状況や課題を「〜という状況」「〜こと」の形で書く。");
    else if (/課題|問題点|リスク|懸念|留意/.test(t)) tips.push("課題・懸念を問われている。「〜こと」の形で，対処すべき事柄を具体的に書く。");
    else {
      var m = /どのような([^，。、\s]{1,12}?)(?:を|が|か|に|で|と)/.exec(t);
      // 「市場ニーズを40字以内で答えよ」のように，答える対象の名詞が字数指定の直前にある形
      var n = /([^\s，。、「」]{1,12})を(?:[\d０-９]+字以内で)?(?:答え|挙げ|述べ)/.exec(t);
      // 文末に使う名詞は，句の末尾の漢字・カタカナの並び（例: 子育て世帯の現状→現状，市場ニーズ→市場ニーズ）
      var tail = function (w) { var r = /([一-龠々ァ-ヶーA-Za-z]+)$/.exec(w.replace(/^.*の/, "")); return r ? r[1] : ""; };
      var mt = m ? tail(m[1]) : "", nt = n ? tail(n[1]) : "";
      if (m && mt) tips.push("「どのような" + m[1] + "」を問われている。文末を「〜" + mt + "」で終える形にすると，問いとずれにくい。");
      else if (n && nt) tips.push("答える対象は「" + nt + "」。文末を「〜" + nt + "」で終える形にすると，問いとずれにくい。");
      else tips.push("設問文が何を答えさせているか（理由・目的・内容など）を確かめ，それに合う文末で結ぶ。");
    }
    if (/二つ|2つ|三つ|3つ/.test(t)) tips.push("複数挙げる設問。互いに別の観点になるようにし，同じ内容の言い換えにしない。");
    var ch = /([^，。\s]{1,15})に着目して/.exec(t);
    if (ch) tips.push("「" + ch[1] + "に着目して」は解答に必ず含める要素。");
    var lim = fp.part.limit;
    if (lim) {
      var el = lim <= 20 ? "1つ（核心だけを簡潔に）" : lim <= 35 ? "1〜2つ" : lim <= 50 ? "2つ程度" : "2〜3つ";
      tips.push(lim + "字なら，盛り込む要素は" + el + "が目安。");
    }
    tips.push("自分の言葉より本文中の語句を使って書くと，題意からずれにくい。");
    return tips;
  }

  /* ---------- ヒント3: 着眼点（js/data/pm1_hints.js。未収録の回は案内のみ） ---------- */
  function focusHint(fp) {
    var h = window.PM1_HINTS || {};
    return h[state.examId + "#" + state.no + "#" + (fp.part.label || "")] || "";
  }

  /* ---------- 演習用の本文（段落ごとに〔節〕・下線番号・図表を属性で持たせる） ---------- */
  function renderExerciseBody(q) {
    var lines = String(q.body || "").split("\n");
    var html = "", buf = [], sec = "";
    function flush() {
      if (!buf.length) return;
      var t = trimStr(buf.join("\n"));
      buf = [];
      if (!t) return;
      var head = /^〔([^〕]+)〕$/.exec(t);
      if (head) sec = head[1];
      // 行頭の①（箇条番号）ではなく，文中に置かれた丸数字を下線番号とみなす
      var uls = [], lis = [];
      t.split("\n").forEach(function (ln) {
        if (CIRCLED.indexOf(ln.charAt(0)) >= 0 && lis.indexOf(ln.charAt(0)) < 0) lis.push(ln.charAt(0));
        ln.slice(1).split("").forEach(function (c) { if (CIRCLED.indexOf(c) >= 0 && uls.indexOf(c) < 0) uls.push(c); });
      });
      html += '<p class="pm1x-p' + (head ? ' pm1x-head' : '') + '" data-sec="' + escapeAttr(sec) + '" data-ul="' + uls.join("") + '" data-li="' + lis.join("") + '">' +
        escapeHtml(t).replace(/\n/g, "<br>") + '</p>';
    }
    lines.forEach(function (line) {
      var m = MARKER_RE.exec(trimStr(line));
      if (m) {
        flush();
        var id = trimStr(m[1]);
        html += '<div class="pm1x-fig" data-sec="' + escapeAttr(sec) + '" data-fig="' + escapeAttr(id.replace(/\s/g, "")) + '">' +
          renderFigureBlock(figureById(q, id)) + '</div>';
      } else if (trimStr(line) === "") flush();
      else buf.push(line);
    });
    flush();
    return html;
  }
  function clearRefs() {
    var pane = $("#pm1x-problem");
    if (!pane) return;
    $all(pane, ".pm1x-sec-hl,.pm1x-ref-hl").forEach(function (el) { el.classList.remove("pm1x-sec-hl", "pm1x-ref-hl"); });
  }
  // 本文側の参照先に色を付け，最初の強い参照先（なければ節の先頭）までスクロールする
  function showRefs(fp) {
    var pane = $("#pm1x-problem");
    if (!pane) return;
    var refs = partRefs(fp);
    clearRefs();
    var secEls = refs.sec ? $all(pane, "[data-sec]").filter(function (el) { return el.dataset.sec === refs.sec; }) : [];
    secEls.forEach(function (el) { el.classList.add("pm1x-sec-hl"); });
    var strong = [];
    // 文中の丸数字（下線など）を優先し，なければ同じ節の箇条番号（①　…）を探す
    var paras = $all(pane, ".pm1x-p");
    refs.uls.forEach(function (c) {
      var hit = paras.filter(function (el) { return (el.dataset.ul || "").indexOf(c) >= 0; });
      if (!hit.length) hit = paras.filter(function (el) {
        return (el.dataset.li || "").indexOf(c) >= 0 && (!refs.sec || el.dataset.sec === refs.sec);
      });
      hit.forEach(function (el) { if (strong.indexOf(el) < 0) strong.push(el); });
    });
    refs.figs.forEach(function (f) {
      $all(pane, ".pm1x-fig").forEach(function (el) { if (el.dataset.fig === f) strong.push(el); });
    });
    strong.forEach(function (el) { el.classList.add("pm1x-ref-hl"); });
    var target = strong[0] || secEls[0];
    if (target) {
      if (state.ratio === "answer") setRatio("half");
      pane.scrollTop = target.offsetTop - pane.offsetTop - 12;
    }
  }
  function refsText(fp) {
    var r = partRefs(fp);
    var parts = [];
    if (r.sec) parts.push("〔" + r.sec + "〕の節");
    if (r.uls.length) parts.push((r.underline ? "下線" : "") + r.uls.join("") + "の箇所");
    if (r.figs.length) parts.push(r.figs.join("・"));
    if (!parts.length) return "設問文に節の指定がない。設問文の語句を手掛かりに，本文全体から関連する記述を探す。";
    return parts.join("，") + "を読む。" + (r.uls.length || r.figs.length ? "本文側の濃い色が直接の手掛かり，薄い色がその節の範囲。" : "本文側で薄く色を付けた範囲。");
  }

  function setRatio(r) {
    state.ratio = r;
    savePref(PREF_RATIO, r);
    var split = $("#pm1x-split");
    if (split) split.dataset.ratio = r;
    $all(root, ".pm1x-ratio-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.r === r); });
  }
  function hintBoxHtml(fp) {
    var lv = (state.doc.hints || {})[fp.idx] || 0;
    var html = '<div class="pm1x-hints" id="pm1x-hints-' + fp.idx + '">' +
      '<div class="pm1x-hint-btns">' +
        '<button type="button" class="pm1x-hint-btn' + (lv >= 1 ? ' used' : '') + '" data-lv="1">ヒント1 読む場所</button>' +
        '<button type="button" class="pm1x-hint-btn' + (lv >= 2 ? ' used' : '') + '" data-lv="2"' + (lv < 1 ? ' disabled' : '') + '>ヒント2 答え方</button>' +
        '<button type="button" class="pm1x-hint-btn' + (lv >= 3 ? ' used' : '') + '" data-lv="3"' + (lv < 2 ? ' disabled' : '') + '>ヒント3 着眼点</button>' +
      '</div>';
    if (lv >= 1) html += '<div class="pm1x-hint"><b>読む場所：</b>' + escapeHtml(refsText(fp)) +
      ' <button type="button" class="linkbtn pm1x-jump">本文の該当箇所へ</button></div>';
    if (lv >= 2) html += '<div class="pm1x-hint"><b>答え方：</b><ul>' +
      answerShapeHint(fp).map(function (t) { return '<li>' + escapeHtml(t) + '</li>'; }).join("") + '</ul></div>';
    if (lv >= 3) {
      var f = focusHint(fp);
      html += '<div class="pm1x-hint"><b>着眼点：</b>' + (f ? escapeHtml(f) : 'この回の着眼点ヒントはまだありません（令和3〜7年度のみ収録）。') + '</div>';
    }
    return html + '</div>';
  }
  function bindHintBox(fp) {
    var box = $("#pm1x-hints-" + fp.idx);
    if (!box) return;
    $all(box, ".pm1x-hint-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var lv = Number(b.dataset.lv);
        if (!state.doc.hints) state.doc.hints = {};
        if ((state.doc.hints[fp.idx] || 0) < lv) {
          state.doc.hints[fp.idx] = lv;
          state.doc.t = Date.now();
          saveDoc();
        }
        box.outerHTML = hintBoxHtml(fp);
        bindHintBox(fp);
        if (lv === 1) showRefs(fp);
      });
    });
    var jump = box.querySelector(".pm1x-jump");
    if (jump) jump.addEventListener("click", function () { showRefs(fp); });
  }

  function renderExerciseTab(body) {
    ensureAnsLive();
    if (!state.ratio) state.ratio = loadPref(PREF_RATIO, "half");
    var hintOn = loadPref(PREF_HINT, "0") === "1";
    document.body.classList.add("pm1-wide");

    var html = '<div class="card pm1x-bar">' +
      '<div class="pm1x-bar-row">' +
        '<span class="pm1x-bar-title">演習（45分）</span>' +
        '<span id="pm1-ex-timer-display" class="pm-timer-display"></span>' +
        '<button type="button" class="primary" id="pm1-ex-timer-start">開始</button>' +
        '<button type="button" id="pm1-ex-timer-toggle">一時停止</button>' +
        '<button type="button" id="pm1-ex-timer-reset">リセット</button>' +
        '<span class="spacer"></span>' +
        '<label class="pm1x-hint-toggle"><input type="checkbox" id="pm1x-hintmode"' + (hintOn ? ' checked' : '') + '> ヒントモード</label>' +
      '</div>' +
      '<div class="pm1x-ratio" role="group" aria-label="問題文と解答欄の比率">' +
        '<button type="button" class="pm1x-ratio-btn" data-r="problem">問題文を広く</button>' +
        '<button type="button" class="pm1x-ratio-btn" data-r="half">半々</button>' +
        '<button type="button" class="pm1x-ratio-btn" data-r="answer">解答を広く</button>' +
      '</div>' +
    '</div>';

    html += '<div class="pm1x-split" id="pm1x-split">' +
      '<div class="pm1x-pane pm1x-problem pm2-lead" id="pm1x-problem">' + renderExerciseBody(state.q) + '</div>' +
      '<div class="pm1x-pane pm1x-answer' + (hintOn ? ' hint-on' : '') + '" id="pm1x-answer">';
    state.flat.forEach(function (fp) {
      if (fp.isFirstInSetsumon) {
        html += '<div class="pm2-setumon-inline">' + escapeHtml(fp.setsumon.text || "") + '</div>';
      }
      var limitSuffix = fp.part.limit ? '（' + escapeHtml(String(fp.part.limit)) + '字以内）' : '';
      html += '<div class="pm2-field">' +
        '<label class="pm2-field-label" for="pm1-ans-' + fp.idx + '">' + escapeHtml(fp.part.label || "") + limitSuffix + '</label>' +
        hintBoxHtml(fp) +
        '<textarea class="pm1-ans-ta" id="pm1-ans-' + fp.idx + '" rows="3"></textarea>' +
        '<div class="pm2-count" id="pm1-count-' + fp.idx + '"></div>' +
      '</div>';
    });
    html += '<div class="pm-panel-actions">' +
      '<span class="pm2-save-status" id="pm1-draft-status"></span>' +
      '<button type="button" id="pm1-btn-draft-save">下書きを保存</button>' +
      '<button type="button" class="primary" id="pm1-btn-compare">解答例と対比する &rarr;</button>' +
    '</div></div></div>';

    body.innerHTML = html;
    setRatio(state.ratio);

    state.flat.forEach(function (fp) {
      var ta = $("#pm1-ans-" + fp.idx);
      ta.value = state.ansLive[fp.idx] || "";
      updateAnsCounter(fp);
      ta.addEventListener("input", function () {
        state.ansLive[fp.idx] = ta.value;
        updateAnsCounter(fp);
      });
      bindHintBox(fp);
    });

    $all(body, ".pm1x-ratio-btn").forEach(function (b) {
      b.addEventListener("click", function () { setRatio(b.dataset.r); });
    });
    $("#pm1x-hintmode").addEventListener("change", function (e) {
      savePref(PREF_HINT, e.target.checked ? "1" : "0");
      $("#pm1x-answer").classList.toggle("hint-on", e.target.checked);
      if (!e.target.checked) clearRefs();
    });

    $("#pm1-btn-draft-save").addEventListener("click", function () {
      saveDraft();
      flashText($("#pm1-draft-status"), "下書きを保存しました");
    });
    $("#pm1-btn-compare").addEventListener("click", function () {
      saveDraft();
      saveVersionSnapshot();
      switchTab("compare");
    });

    $("#pm1-ex-timer-start").addEventListener("click", startExTimer);
    $("#pm1-ex-timer-toggle").addEventListener("click", toggleExTimer);
    $("#pm1-ex-timer-reset").addEventListener("click", resetExTimerClick);
    updateExTimerButtons();
    updateExTimerDisplay();
    startExTimerLoop();

    startAutosave();
  }

  /* =====================================================================
     対比・採点タブ
     ===================================================================== */
  function getCurrentAnswers() {
    if (state.ansLive) return state.ansLive;
    if (state.doc.ans.draft) return state.doc.ans.draft;
    var versions = state.doc.ans.versions || [];
    if (versions.length) return versions[0].ans || {};
    return {};
  }

  // AI採点用プロンプトの本文: {{表N}}等のマーカーをタブ区切りテキスト（表）や
  // 省略注記（図）に変換して埋め込む。
  function htmlTableToText(html) {
    var div = document.createElement("div");
    div.innerHTML = html;
    var lines = [];
    var caption = div.querySelector("caption");
    if (caption) lines.push(trimStr(caption.textContent));
    $all(div, "tr").forEach(function (tr) {
      var cells = $all(tr, "th,td");
      lines.push(cells.map(function (c) { return trimStr(c.textContent); }).join("\t"));
    });
    return lines.join("\n");
  }
  function figureToPromptText(fig) {
    if (fig.html) return htmlTableToText(fig.html);
    if (fig.image) return "（" + fig.id + "省略。内容は本文から推測可能な範囲で判断）";
    return "";
  }
  function bodyForPrompt(q) {
    var text = String(q.body || "");
    return text.replace(/\{\{([^{}]+)\}\}/g, function (whole, id) {
      var fig = figureById(q, trimStr(id));
      if (!fig) return whole;
      return "[" + fig.id + "]\n" + figureToPromptText(fig);
    });
  }
  function buildAiPrompt(answers) {
    var q = state.q;
    var lines = [];
    lines.push("あなたはITストラテジスト試験 午後I（記述式）の採点者です。IPAが公表する公式解答例を採点基準としつつ、記述内容の趣旨が公式解答例と合致していれば、表現や言い回しの違いは許容してください。");
    lines.push("");
    lines.push("■テーマ: " + displayTitleFor(state.exam, q));
    lines.push("");
    lines.push("■本文:");
    lines.push(bodyForPrompt(q));
    lines.push("");
    lines.push("■設問と解答:");
    state.flat.forEach(function (fp) {
      if (fp.isFirstInSetsumon) {
        lines.push("");
        lines.push("◆" + (fp.setsumon.label || "") + " " + (fp.setsumon.text || ""));
      }
      lines.push("");
      lines.push("【" + (fp.part.label || "") + "】" + (fp.part.limit ? "（" + fp.part.limit + "字以内）" : ""));
      lines.push("公式解答例: " + (fp.part.answer || "（なし）"));
      lines.push("あなたの答案: " + (trimStr(answers[fp.idx]) || "（未入力）"));
    });
    lines.push("");
    lines.push("■出題趣旨:");
    lines.push(q.shushi || "（なし）");
    lines.push("");
    lines.push("■採点講評:");
    lines.push(q.kouhyo || "（なし）");
    lines.push("");
    lines.push("■出力してほしい内容:");
    lines.push("設問のpartごとに、番号を付けて次の形式で採点してください。");
    lines.push("1. 判定: ○（合格水準）／△（不十分）／×（不適切）のいずれか");
    lines.push("2. 判定の根拠");
    lines.push("3. 公式解答例との差分（趣旨のズレ・不足している要素）");
    lines.push("4. 改善答案例");
    return lines.join("\n");
  }

  function renderCompareTab(body) {
    var q = state.q;
    var answers = getCurrentAnswers();
    var grades = state.doc.grades || {};
    var hintsUsed = state.doc.hints || {};

    var html = "";
    state.flat.forEach(function (fp) {
      if (fp.isFirstInSetsumon) {
        html += '<div class="card pm2-setumon-box">' +
          '<div class="group-head"><h2>' + escapeHtml(fp.setsumon.label || "") + '</h2></div>' +
          '<div class="pm2-setumon-body">' + escapeHtml(fp.setsumon.text || "") + '</div>' +
        '</div>';
      }
      var ansText = trimStr(answers[fp.idx]);
      var g = grades[fp.idx] || "";
      html += '<div class="card">' +
        '<div class="group-head"><h3>' + escapeHtml(fp.part.label || "") + '</h3>' +
          (hintsUsed[fp.idx] ? '<span class="pm1x-hint-badge">ヒント' + hintsUsed[fp.idx] + 'まで使用</span>' : '') + '</div>' +
        '<div class="pm1-compare-box pm1-compare-mine">' +
          '<div class="pm1-compare-label">あなたの答案</div>' +
          '<div class="pm1-compare-text">' + (ansText ? escapeHtml(ansText) : '<span class="pm1-empty-inline">（未入力）</span>') + '</div>' +
        '</div>' +
        '<div class="pm1-compare-box pm1-compare-model">' +
          '<div class="pm1-compare-label">公式解答例</div>' +
          '<div class="pm1-compare-text">' + escapeHtml(fp.part.answer || "（未収録）") + '</div>' +
        '</div>' +
        '<div class="pm1-grade-row">' +
          GRADE_OPTIONS.map(function (sym) {
            return '<button type="button" class="pm1-grade-btn' + (g === sym ? ' active' : '') +
              '" data-idx="' + fp.idx + '" data-g="' + sym + '">' + sym + '</button>';
          }).join("") +
        '</div>' +
      '</div>';
    });

    html += '<div class="card">' +
      '<div class="group-head"><h2>採点講評</h2></div>' +
      '<details><summary>採点講評を表示</summary><pre class="pm2-pre">' + escapeHtml(q.kouhyo || "（未収録）") + '</pre></details>' +
    '</div>';

    html += '<div class="card">' +
      '<div class="group-head"><h2>総合自己評価</h2></div>' +
      '<label class="opt">評価 <select id="pm1-overall">' +
        '<option value="">未評価</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>' +
      '</select></label>' +
      '<div class="pm-panel-actions"><span class="pm2-save-status" id="pm1-record-status"></span>' +
        '<button type="button" class="primary" id="pm1-btn-save-record">演習記録に保存</button></div>' +
    '</div>';

    html += '<div class="card">' +
      '<div class="group-head"><h2>メモ（気づき）</h2></div>' +
      '<textarea class="pm2-ai-result" id="pm1-memo" rows="4" placeholder="気づき・弱点など"></textarea>' +
    '</div>';

    html += '<div class="card">' +
      '<div class="group-head"><h2>AI採点</h2></div>' +
      '<div class="pm2-ai-actions">' +
        '<button type="button" class="primary" id="pm1-btn-copy-prompt">AI採点用にコピー</button>' +
        '<span class="pm2-copy-status" id="pm1-copy-status"></span>' +
      '</div>' +
      '<label class="pm2-field-label">AI採点結果の貼り付け欄</label>' +
      '<textarea class="pm2-ai-result" id="pm1-ai-result" rows="8" placeholder="AIから返ってきた採点結果をここに貼り付けて保存できます"></textarea>' +
    '</div>';

    body.innerHTML = html;

    $all(body, ".pm1-grade-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = btn.dataset.idx;
        var g = btn.dataset.g;
        var cur = state.doc.grades[idx];
        if (cur === g) delete state.doc.grades[idx]; // 同じボタンの再クリックで解除
        else state.doc.grades[idx] = g;
        state.doc.t = Date.now();
        saveDoc();
        // 他の入力欄（メモ等）の未保存内容を消さないため、全体は再描画せずボタン行だけ更新する
        $all(body, '.pm1-grade-btn[data-idx="' + idx + '"]').forEach(function (b2) {
          b2.classList.toggle("active", state.doc.grades[idx] === b2.dataset.g);
        });
      });
    });

    var overallSel = $("#pm1-overall");
    overallSel.value = state.doc.overall || "";
    overallSel.addEventListener("change", function () {
      state.doc.overall = overallSel.value;
      state.doc.t = Date.now();
      saveDoc();
    });

    var memoTa = $("#pm1-memo");
    memoTa.value = state.doc.memo || "";
    memoTa.addEventListener("input", function () { state.doc.memo = memoTa.value; });
    memoTa.addEventListener("change", function () {
      state.doc.memo = memoTa.value;
      state.doc.t = Date.now();
      saveDoc();
    });

    $("#pm1-btn-save-record").addEventListener("click", function () {
      var recKey = state.examId + "#pm1#" + state.no;
      var rec = {
        s: "done",
        g: state.doc.overall || "",
        m: Math.round(exElapsedSec() / 60),
        note: trimStr(state.doc.memo).slice(0, 50),
        t: Date.now()
      };
      var hintN = Object.keys(state.doc.hints || {}).filter(function (k) { return state.doc.hints[k] > 0; }).length;
      if (hintN) rec.h = hintN; // ヒントを使った解答欄の数（一覧に「ヒント使用」と表示）
      saveExerciseRecord(recKey, rec);
      flashText($("#pm1-record-status"), "演習記録に保存しました");
    });

    var aiTa = $("#pm1-ai-result");
    aiTa.value = state.doc.ai || "";
    aiTa.addEventListener("input", function () { state.doc.ai = aiTa.value; });
    aiTa.addEventListener("change", function () {
      state.doc.ai = aiTa.value;
      state.doc.t = Date.now();
      saveDoc();
    });

    $("#pm1-btn-copy-prompt").addEventListener("click", function () {
      var text = buildAiPrompt(answers);
      copyText(text).then(function () {
        flashText($("#pm1-copy-status"), "コピーしました", 2000);
      }).catch(function () {
        flashText($("#pm1-copy-status"), "コピーに失敗しました", 2000);
      });
    });
  }

  /* =====================================================================
     画面の骨格・タブ切替
     ===================================================================== */
  function teardownTabResources(tab) {
    if (!state) return;
    if (tab === "exercise") {
      stopAutosave();
      stopExTimerLoop();
      document.body.classList.remove("pm1-wide");
    }
  }

  function renderTabBody() {
    var body = $("#pm1-tabbody");
    if (!body) return;
    if (state.activeTab === "problem") renderProblemTab(body);
    else if (state.activeTab === "exercise") renderExerciseTab(body);
    else if (state.activeTab === "compare") renderCompareTab(body);
    else if (state.activeTab === "material") renderMaterialTab(body);
  }

  function updateTabButtons() {
    $all(root, ".pm2-tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === state.activeTab);
    });
  }

  function switchTab(newTab) {
    if (state.activeTab === newTab) return;
    teardownTabResources(state.activeTab);
    state.activeTab = newTab;
    updateTabButtons();
    renderTabBody();
  }

  function renderShell() {
    var exam = state.exam;
    var q = state.q;
    root.innerHTML =
      '<div id="pm1-warning" class="pm2-warning" hidden></div>' +
      '<div class="card pm2-head-card">' +
        '<div class="group-head"><button type="button" class="linkbtn" id="pm1-btn-back">&larr; 一覧へ戻る</button></div>' +
        '<div class="pm2-head-title">' +
          '<span class="badge exam">' + escapeHtml(exam.examLabel) + '</span>' +
          '<span class="badge pm-no">問' + q.no + '</span>' +
          '<h2 class="pm2-title">' + escapeHtml(displayTitleFor(exam, q)) + '</h2>' +
        '</div>' +
        '<div class="pm2-subtabs">' +
          TABS.map(function (t) {
            return '<button type="button" class="pm2-tab-btn" data-tab="' + t.id + '">' + escapeHtml(t.label) + '</button>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<div id="pm1-tabbody"></div>';

    $("#pm1-btn-back").addEventListener("click", closeStudy);
    $all(root, ".pm2-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchTab(btn.dataset.tab); });
    });

    updateTabButtons();
    renderCloudWarning();
    renderTabBody();
  }

  /* ---------- 起動・終了 ---------- */
  function open(examId, no) {
    var exam = findExam(examId);
    var q = findThemeQuestion(examId, no);
    if (!exam || !q) return; // データが無い場合は何もしない（学習ボタンはpm.js側で該当時のみ表示）

    if (state) teardownTabResources(state.activeTab);

    state = newState(examId, no, exam, q);
    var themeKey = state.themeKey;

    pmMain.hidden = true;
    var pm2root = $("#pm2-study");
    if (pm2root) pm2root.hidden = true; // 念のため（通常はpm.js側のモード制御でどちらか一方しか開かない）
    root.hidden = false;
    root.innerHTML = '<p class="pm-empty">読み込み中…</p>';

    loadDoc(themeKey).then(function (doc) {
      // 読み込み中に別テーマへ遷移／画面が閉じられていた場合は結果を捨てる
      if (!state || state.themeKey !== themeKey) return;
      state.doc = doc;
      renderShell();
    });
  }

  function closeStudy() {
    if (state) teardownTabResources(state.activeTab);
    state = null;
    root.hidden = true;
    root.innerHTML = "";
    pmMain.hidden = false;
    if (window.PmUI && window.PmUI.refreshList) window.PmUI.refreshList();
  }

  window.PM1Study = { open: open };
})();
