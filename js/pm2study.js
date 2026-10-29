/* ST 午後II論述 学習画面（問題文・ドリル・骨子・執筆・振り返り・資料）
   window.PM2Study.open(examId, no) で起動する。
   表示対象データは window.PM2_TEXT[examId].questions から取得する
   （データが無い年度・問については js/pm.js 側が「学習」ボタン自体を出さない）。 */
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  function $all(elOrSel, sel) {
    var scope = sel ? elOrSel : document;
    var s = sel || elOrSel;
    return Array.prototype.slice.call(scope.querySelectorAll(s));
  }

  var root = $("#pm2-study");
  var pmMain = $("#pm-main");
  if (!root || !pmMain) return; // 想定外のDOM構成の場合は安全に何もしない

  /* ---------- 字数規定（午後II論述の固定仕様） ---------- */
  var LIMITS = {
    a: { min: 0,   max: 800,  label: "800字以内" },
    i: { min: 800, max: 1600, label: "800字以上1,600字以内" },
    u: { min: 600, max: 1200, label: "600字以上1,200字以内" }
  };
  var KEY_ORDER = ["a", "i", "u"];
  var KANA_LABEL = { a: "設問ア", i: "設問イ", u: "設問ウ" };

  var TABS = [
    { id: "problem", label: "問題文" },
    { id: "drill", label: "ドリル" },
    { id: "steps", label: "段階学習" },
    { id: "outline", label: "骨子" },
    { id: "write", label: "執筆" },
    { id: "review", label: "振り返り" },
    { id: "material", label: "資料" }
  ];

  var CHECK_ITEMS = [
    { id: "c1", label: "設問ア・イ・ウすべてに答えた" },
    { id: "c2", label: "字数規定を満たした" },
    { id: "c3", label: "ITストラテジストの立場で一貫している" },
    { id: "c4", label: "一つの事例で一貫している" },
    { id: "c5", label: "効果・評価に定量的な記述がある" },
    { id: "c6", label: "検討の過程と工夫が書けている" },
    { id: "c7", label: "出題趣旨の観点に対応している" }
  ];

  /* ---------- ユーティリティ ---------- */
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
  function renderParagraphs(body) {
    var text = String(body || "");
    var blocks = text.split(/\n{2,}/);
    var html = "";
    blocks.forEach(function (block) {
      var trimmed = trimStr(block);
      if (!trimmed) return;
      html += "<p>" + escapeHtml(trimmed).replace(/\n/g, "<br>") + "</p>";
    });
    return html;
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

  /* ---------- 同期の状態確認 (js/sync.js) ---------- */
  function syncActive() {
    return !!(window.STSync && window.STSync.active());
  }

  /* ---------- ドキュメントの既定形・正規化・端末内保存 ---------- */
  function defaultDoc() {
    return {
      outline: { versions: [] },
      essay: { draft: null, versions: [] },
      check: { items: {}, ai: "", t: 0 },
      steps: { fill: {}, write: {}, copy: {}, grade: {}, wgrade: {} } // 段階学習: 穴埋め・見出しごとに書いた文・見本の打ち込み・段階3と段階4の自己判定（段落idごと）
    };
  }
  function normalizeDoc(data) {
    var d = defaultDoc();
    if (!data || typeof data !== "object") return d;
    if (data.outline && Array.isArray(data.outline.versions)) d.outline.versions = data.outline.versions;
    if (data.essay) {
      if (data.essay.draft && typeof data.essay.draft === "object") d.essay.draft = data.essay.draft;
      if (Array.isArray(data.essay.versions)) d.essay.versions = data.essay.versions;
    }
    if (data.steps && typeof data.steps === "object") {
      if (data.steps.fill && typeof data.steps.fill === "object") d.steps.fill = data.steps.fill;
      if (data.steps.write && typeof data.steps.write === "object") d.steps.write = data.steps.write;
      if (data.steps.copy && typeof data.steps.copy === "object") d.steps.copy = data.steps.copy;
      if (data.steps.grade && typeof data.steps.grade === "object") d.steps.grade = data.steps.grade;
      if (data.steps.wgrade && typeof data.steps.wgrade === "object") d.steps.wgrade = data.steps.wgrade;
    }
    if (data.check) {
      if (data.check.items && typeof data.check.items === "object") d.check.items = data.check.items;
      if (typeof data.check.ai === "string") d.check.ai = data.check.ai;
      if (data.check.self && typeof data.check.self === "object") d.check.self = data.check.self; // 自己評価（ア・イ・ウ・総合のA〜D）
      if (data.check.t) d.check.t = data.check.t;
    }
    return d;
  }
  function localKey(themeKey) { return "st_pm2doc_" + themeKey; }
  function loadLocalDoc(themeKey) {
    try { return normalizeDoc(JSON.parse(localStorage.getItem(localKey(themeKey)))); }
    catch (e) { return defaultDoc(); }
  }
  function saveLocalDoc(themeKey, doc) {
    try { localStorage.setItem(localKey(themeKey), JSON.stringify(doc)); } catch (e) { /* ignore */ }
  }

  /* ---------- データ参照 ---------- */
  function findExam(examId) {
    var found = null;
    (window.PM_INDEX || []).forEach(function (e) { if (e.examId === examId) found = e; });
    return found;
  }
  function findThemeQuestion(examId, no) {
    var theme = window.PM2_TEXT && window.PM2_TEXT[examId];
    if (!theme || !theme.questions) return null;
    var found = null;
    theme.questions.forEach(function (q) { if (q.no === no) found = q; });
    return found;
  }
  // PM2_TEXTの正式タイトルが未収録（空文字）の場合に備え、js/pm.js の一覧と同じ考え方で
  // window.PM_INDEX の仮題にフォールバックする。
  function displayTitleFor(exam, q) {
    if (q.title) return q.title;
    var pm2 = (exam && exam.pm2) || {};
    var found = null;
    (pm2.questions || []).forEach(function (pq) { if (pq.no === q.no) found = pq; });
    return (found && found.title) || "";
  }

  /* ---------- 状態（open()のたびに作り直す） ---------- */
  var state = null;

  function newState(examId, no, exam, q) {
    return {
      examId: examId,
      no: no,
      exam: exam,
      q: q,
      themeKey: examId + "#pm2#" + no,
      doc: defaultDoc(),
      useLocalFallback: false,
      activeTab: "problem",
      drillEngine: null,
      essayLive: null,       // { a, i, u } 執筆タブの入力中キャッシュ（タブ切替をまたいで保持）
      essayLiveInit: false,
      outlineLive: null,     // { a, i, u } 骨子タブの入力中キャッシュ
      autosaveIntervalId: null,
      writeTimer: {
        totalSec: 120 * 60,
        remainingSec: 120 * 60,
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
      return window.STSync.loadPm2Doc(themeKey).then(function (data) {
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
      window.STSync.savePm2Doc(themeKey, doc).then(function (result) {
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
    var el = $("#pm2-warning");
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
     問題文タブ
     ===================================================================== */
  function renderProblemTab(body) {
    var q = state.q;
    var qq = q.q || {};
    body.innerHTML =
      '<div class="card"><div class="pm2-lead">' + renderParagraphs(q.lead) + '</div></div>' +
      KEY_ORDER.map(function (k) {
        return '<div class="card pm2-setumon-box">' +
          '<div class="group-head"><h2>' + KANA_LABEL[k] + '</h2><span class="spacer"></span>' +
          '<span class="pm2-limit-label">' + escapeHtml(LIMITS[k].label) + '</span></div>' +
          '<div class="pm2-setumon-body">' + escapeHtml(qq[k] || "（未収録）") + '</div>' +
        '</div>';
      }).join("");
  }

  /* =====================================================================
     資料タブ
     ===================================================================== */
  function renderMaterialTab(body) {
    var q = state.q;
    var pm2 = state.exam.pm2 || {};
    var urls = pm2.urls || {};
    body.innerHTML =
      '<div class="card">' +
        '<div class="group-head"><h2>資料PDF</h2></div>' +
        '<div class="pm2-links">' +
          (urls.qs ? '<a href="' + escapeAttr(urls.qs) + '" target="_blank" rel="noopener">問題</a>' : '') +
          (urls.ans ? '<a href="' + escapeAttr(urls.ans) + '" target="_blank" rel="noopener">出題趣旨</a>' : '') +
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
     ドリルタブ
     ===================================================================== */
  /* =====================================================================
     段階学習タブ（js/data/pm2_steps.js）
     1 見本を読む → 2 選んで組み立てる → 3 穴埋めで書く → 4 見出しごとに書く → 5 骨子だけで書く
     ===================================================================== */
  var STEP_STAGES = [
    { n: 1, label: "1 見本を読む", desc: "A社の模範論文を、骨子の見出しごとに読みます。黄色の文が各段落の「要の1文」です。使った部品と組み立て方（文型）も確認します。" },
    { n: 2, label: "2 選んで組み立てる", desc: "各段落の要の1文や考え方を、選択肢から選びます。間違いの選択肢は、採点講評で指摘されたよくある失敗です。" },
    { n: 3, label: "3 穴埋めで書く", desc: "模範論文の要の1文だけが空欄になっています。前後の文を読んで、空欄の1文を自分で書き、答え合わせをします。" },
    { n: 4, label: "4 見出しごとに書く", desc: "見出しを1つずつ、組み立て方（文型）と部品を見ながら自分で書きます。書いたら見本と比べます。" },
    { n: 5, label: "5 骨子だけで書く", desc: "補助なしで書く本番形式です。骨子タブで見出しを作り、執筆タブで120分で書きます。" }
  ];
  var PREF_STEP = "st_pm2_step_stage";
  function loadPref(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function savePref(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* ignore */ } }
  var PART_KEY = { "ア": "a", "イ": "i", "ウ": "u" };

  function stepsData() { return (window.PM2_STEPS || {})[state.examId + "-" + state.no] || null; }
  function stepsAvailableText() {
    var all = window.PM2_STEPS || {};
    return Object.keys(all).map(function (k) { return all[k].title; }).join("／");
  }
  function findPartText(label) {
    var groups = window.PM2_PARTS || [];
    for (var g = 0; g < groups.length; g++) {
      for (var i = 0; i < groups[g].items.length; i++) {
        if (groups[g].items[i].label.indexOf(label) === 0) return groups[g].items[i].text;
      }
    }
    return "";
  }
  function stepChars(t) { return String(t || "").replace(/\r?\n/g, "").length; }
  function patternHtml(key) {
    var pt = (window.PM2_PATTERNS || {})[key];
    if (!pt) return "";
    return '<div class="pm2s-pattern"><b>組み立て方：' + escapeHtml(pt.name) + '</b><ol>' +
      pt.steps.map(function (x) { return "<li>" + escapeHtml(x) + "</li>"; }).join("") + '</ol></div>';
  }
  function partsChipsHtml(sec) {
    return '<div class="pm2s-parts">使った部品：' + sec.parts.map(function (x) { return '<span>' + escapeHtml(x) + '</span>'; }).join("") + '</div>';
  }
  // 設問ア・イ・ウごとに段落をまとめ、見出しの前に設問文を出す
  function eachPartGroup(data, fn, keep) {
    var html = "";
    ["ア", "イ", "ウ"].forEach(function (part) {
      var secs = data.sections.filter(function (x) { return x.part === part && (!keep || keep(x)); });
      if (!secs.length) return;
      var total = secs.reduce(function (a, x) { return a + stepChars(x.text); }, 0);
      html += '<div class="card"><div class="group-head"><h2>設問' + part + '</h2><span class="spacer"></span><span class="pm2s-total">見本 ' + total + '字</span></div>' +
        '<div class="pm2-setumon-inline">' + escapeHtml((state.q.q || {})[PART_KEY[part]] || "") + '</div>' +
        secs.map(fn).join("") + '</div>';
    });
    return html;
  }

  function renderStepsTab(body) {
    var data = stepsData();
    if (!data) {
      body.innerHTML = '<div class="card"><div class="group-head"><h2>段階学習</h2></div>' +
        '<p class="stats-note">このテーマの段階学習はまだありません。現在あるのは「' + escapeHtml(stepsAvailableText()) + '」です。</p></div>';
      return;
    }
    var stage = Number(state.stepStage || loadPref(PREF_STEP) || 1);
    if (!(stage >= 1 && stage <= 5)) stage = 1;
    state.stepStage = stage;
    var info = STEP_STAGES[stage - 1];
    body.innerHTML =
      '<div class="card pm2s-head">' +
        '<div class="pm2s-stages" role="tablist">' + STEP_STAGES.map(function (st) {
          return '<button type="button" class="pm2s-stage' + (st.n === stage ? ' active' : '') + '" data-n="' + st.n + '">' + escapeHtml(st.label) + '</button>';
        }).join("") + '</div>' +
        '<p class="stats-note">' + escapeHtml(info.desc) + '</p>' +
      '</div>' +
      '<div id="pm2s-body"></div>';
    $all(body, ".pm2s-stage").forEach(function (b) {
      b.addEventListener("click", function () {
        if (state.drillEngine) { state.drillEngine.destroy(); state.drillEngine = null; }
        state.stepStage = Number(b.dataset.n);
        savePref(PREF_STEP, String(state.stepStage));
        renderStepsTab(body);
      });
    });
    var box = $("#pm2s-body");
    if (stage === 1) renderStepRead(box, data);
    else if (stage === 2) renderStepSelect(box, data);
    else if (stage === 3) renderStepFill(box, data);
    else if (stage === 4) renderStepWrite(box, data);
    else renderStepFinal(box);
  }

  // 段階1: 見本を読む（要の1文を黄色で示す）。隣の欄に見本を打ち込んで、文の流れを手で覚える
  function renderStepRead(box, data) {
    var copy = state.doc.steps.copy;
    box.innerHTML = eachPartGroup(data, function (sec) {
      var t = escapeHtml(sec.text), k = escapeHtml(sec.key);
      t = t.replace(k, '<mark class="pm2s-key">' + k + '</mark>');
      return '<div class="pm2s-sec">' +
        '<h3>' + escapeHtml(sec.id + " " + sec.head) + '<small>' + stepChars(sec.text) + '字</small></h3>' +
        '<div class="pm2s-copy-grid">' +
          '<div class="pm2s-text"><span class="pm2s-head-line">' + escapeHtml(sec.id + " " + sec.head) + '</span>\n' + t + '</div>' +
          '<div class="pm2s-copy">' +
            '<textarea class="pm2s-copy-ta" data-id="' + escapeAttr(sec.id) + '" placeholder="見本を打ち込みます（意味を考えながら）">' + escapeHtml(copy[sec.id] || "") + '</textarea>' +
            '<div class="pm2-count muted" data-copycount="' + escapeAttr(sec.id) + '"></div>' +
          '</div>' +
        '</div>' +
        partsChipsHtml(sec) + patternHtml(sec.pattern) +
        '<p class="pm2s-note">' + escapeHtml(sec.note) + '</p>' +
      '</div>';
    });
    var byId = {};
    data.sections.forEach(function (x) { byId[x.id] = x; });
    $all(box, ".pm2s-copy-ta").forEach(function (ta) {
      var sec = byId[ta.dataset.id];
      var cnt = box.querySelector('[data-copycount="' + ta.dataset.id + '"]');
      function upd() {
        // 見出しの行も含めて見本と比べる（論文では見出しも書くため）
        var mine = ta.value.replace(/\r?\n/g, ""), model = (sec.id + " " + sec.head + sec.text).replace(/\n/g, "");
        var same = 0;
        while (same < mine.length && same < model.length && mine.charAt(same) === model.charAt(same)) same++;
        var done = mine === model;
        cnt.textContent = done ? "見本と同じ文になりました（" + model.length + "字）" :
          stepChars(ta.value) + " / " + model.length + " 字" + (mine.length && same < mine.length ? "（" + (same + 1) + "字目から見本と違います）" : "");
        cnt.className = "pm2-count " + (done ? "ok" : mine.length && same < mine.length ? "ng" : "muted");
      }
      ta.addEventListener("input", upd);
      ta.addEventListener("change", function () {
        state.doc.steps.copy[ta.dataset.id] = ta.value;
        saveDoc();
      });
      upd();
    });
  }

  // 段階2: 選んで組み立てる（ドリルエンジンを利用）
  function renderStepSelect(box, data) {
    if (!(window.DrillUI && window.DrillUI.mountSet)) {
      box.innerHTML = '<p class="pm-empty">ドリル機能を読み込めませんでした。</p>';
      return;
    }
    box.innerHTML = '<div id="pm2s-drill"></div>';
    state.drillEngine = window.DrillUI.mountSet($("#pm2s-drill"), {
      setId: "pm2step#" + state.examId + "#" + state.no,
      title: "選んで組み立てる",
      description: "各段落の要の1文や考え方を選びます。解説で、ほかの選択肢がなぜ不適切か（採点講評のよくある失敗）を確認しましょう。",
      questions: data.drills || []
    });
  }

  // 段階3: 穴埋めで書く
  // 書き出しのヒント（空欄の最初の読点まで）と，その型。型はよく使う書き出しの言葉で判定する
  var OPENER_TYPES = [
    [/^このため、/, "つなぐ文（事業特性・現状 → 経営への影響）"],
    [/^この結果、/, "つなぐ文（課題 → 経営課題への影響）"],
    [/^そこで/, "言い切る文（自分の判断・工夫・改善）"],
    [/^(その結果|協議の結果|これにより|これらの分析から)、/, "結果を示す文（協力・合意・効果）"],
    [/^第[一二三四]に、/, "並べる文（2つ目以降の要素）"],
    [/[0-9０-９]/, "数字で示す文"]
  ];
  function keyOpener(key) {
    var i = key.indexOf("、");
    var head = i > 0 && i <= 12 ? key.slice(0, i + 1) : key.slice(0, 8) + "…";
    var type = "";
    for (var t = 0; t < OPENER_TYPES.length; t++) {
      if (OPENER_TYPES[t][0].test(t === 5 ? key : head)) { type = OPENER_TYPES[t][1]; break; }
    }
    return { head: head, type: type };
  }
  // 段階3・4 共通: 白紙から書く・自己判定（◯△×）・×と△だけ解き直す
  // 開いたときは入力欄を空にし，前回の答えは答え合わせのときに見せる。開いている間に書いた欄はそのまま表示する
  var STEP_GRADE_MARK = { o: "◯", t: "△", x: "×" };
  var STEP_KINDS = {
    fill: { store: "fill", grade: "grade", what: "空欄",
      labels: [["o", "◯ 役割も要点も合っている"], ["t", "△ 役割は合っている"], ["x", "× 違う"]],
      note: "判定は言葉ではなく，書き出しの型（役割）と要点が合っているかで付けます。" },
    write: { store: "write", grade: "wgrade", what: "見出し",
      labels: [["o", "◯ 組み立て方どおりに書けた"], ["t", "△ 一部の要素が抜けた"], ["x", "× 書けなかった"]],
      note: "判定は見本と同じ言葉かではなく，組み立て方の要素がそろい，A社の数字や事情が入っているかで付けます。" }
  };
  function stepSess(kind) {
    if (!state.stepSess) state.stepSess = {};
    if (!state.stepSess[kind]) state.stepSess[kind] = { retry: false, fresh: {}, prev: {} };
    return state.stepSess[kind];
  }
  function stepGradeHeadHtml(kind, data) {
    var k = STEP_KINDS[kind], ss = stepSess(kind), g = state.doc.steps[k.grade];
    var cnt = { o: 0, t: 0, x: 0, none: 0 };
    data.sections.forEach(function (x) { cnt[g[x.id] || "none"]++; });
    var retryN = cnt.t + cnt.x;
    if (ss.retry && !retryN) ss.retry = false;
    return '<div class="card pm2s-fill-head">' +
      '<div class="pm2s-fill-sum">自己判定：◯ ' + cnt.o + '・△ ' + cnt.t + '・× ' + cnt.x + '・未判定 ' + cnt.none + '</div>' +
      '<div class="pm2s-fill-mode" role="group">' +
        '<button type="button" class="pm2s-mode' + (!ss.retry ? ' active' : '') + '" data-retry="0">すべての' + k.what + 'を白紙から</button>' +
        '<button type="button" class="pm2s-mode' + (ss.retry ? ' active' : '') + '" data-retry="1"' + (retryN ? '' : ' disabled') + '>×と△だけ解き直す（' + retryN + '）</button>' +
      '</div>' +
      '<p class="stats-note">開くたびに入力欄は空になります。前回の答えは「答え合わせ」で見本と一緒に表示されます。' + k.note + '</p>' +
    '</div>';
  }
  function stepKeep(kind) {
    var k = STEP_KINDS[kind], g = state.doc.steps[k.grade];
    return stepSess(kind).retry ? function (x) { return g[x.id] === "t" || g[x.id] === "x"; } : null;
  }
  function stepMine(kind, id) {
    var ss = stepSess(kind);
    return ss.fresh[id] ? (state.doc.steps[STEP_KINDS[kind].store][id] || "") : "";
  }
  function stepPrev(kind, id) {
    var ss = stepSess(kind);
    if (ss.prev.hasOwnProperty(id)) return ss.prev[id];
    return ss.fresh[id] ? "" : (state.doc.steps[STEP_KINDS[kind].store][id] || "");
  }
  function stepGradeTag(kind, id) {
    var g = state.doc.steps[STEP_KINDS[kind].grade][id];
    return g ? '<span class="pm2s-grade-tag g-' + g + '">' + STEP_GRADE_MARK[g] + '</span>' : '';
  }
  function stepAnswerExtrasHtml(kind, id) {
    var k = STEP_KINDS[kind], g = state.doc.steps[k.grade][id] || "", prev = stepPrev(kind, id);
    return (prev ? '<div class="pm2s-prev"><b>前回の答え：</b>' + escapeHtml(prev) + '</div>' : '') +
      '<div class="pm2s-grade" role="group" aria-label="自己判定">' + k.labels.map(function (x) {
        return '<button type="button" class="pm2s-grade-btn g-' + x[0] + (g === x[0] ? ' active' : '') + '" data-g="' + x[0] + '">' + escapeHtml(x[1]) + '</button>';
      }).join("") + '</div>';
  }
  function bindStepCommon(kind, box, taSel, rerender) {
    var k = STEP_KINDS[kind], ss = stepSess(kind);
    $all(box, ".pm2s-mode").forEach(function (b) {
      b.addEventListener("click", function () {
        ss.retry = b.dataset.retry === "1";
        ss.fresh = {};
        ss.prev = {};
        rerender();
      });
    });
    $all(box, taSel).forEach(function (ta) {
      var id = ta.dataset.id;
      ta.addEventListener("input", function () {
        if (!ss.fresh[id]) {
          if (!ss.prev.hasOwnProperty(id)) ss.prev[id] = state.doc.steps[k.store][id] || "";
          ss.fresh[id] = true;
        }
      });
      ta.addEventListener("change", function () {
        state.doc.steps[k.store][id] = ta.value;
        saveDoc();
      });
    });
    $all(box, ".pm2s-check").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ans = btn.closest(".pm2s-sec").querySelector(".pm2s-answer");
        ans.hidden = !ans.hidden;
        btn.textContent = ans.hidden ? btn.dataset.label : "見本を隠す";
      });
    });
    $all(box, ".pm2s-grade-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var sec = b.closest(".pm2s-sec"), id = sec.dataset.id, ta = sec.querySelector(taSel);
        if (ta && ss.fresh[id]) state.doc.steps[k.store][id] = ta.value; // 判定と一緒に，今書いた文を保存する
        var gm = state.doc.steps[k.grade];
        if (gm[id] === b.dataset.g) delete gm[id]; else gm[id] = b.dataset.g;
        saveDoc();
        var y = window.scrollY;
        rerender();
        window.scrollTo(0, y);
      });
    });
  }

  function renderStepFill(box, data) {
    var head = stepGradeHeadHtml("fill", data);
    box.innerHTML = head + eachPartGroup(data, function (sec) {
      var i = sec.text.indexOf(sec.key);
      var before = sec.text.slice(0, i), after = sec.text.slice(i + sec.key.length);
      var op = keyOpener(sec.key);
      return '<div class="pm2s-sec" data-id="' + escapeAttr(sec.id) + '">' +
        '<h3>' + escapeHtml(sec.id + " " + sec.head) + stepGradeTag("fill", sec.id) + '</h3>' +
        '<div class="pm2s-text">' + escapeHtml(before) +
          '<span class="pm2s-blank"><span class="pm2s-blank-hint">空欄：' + escapeHtml(sec.keyHint) + '</span>' +
          '<textarea class="pm2s-fill" rows="2" data-id="' + escapeAttr(sec.id) + '">' + escapeHtml(stepMine("fill", sec.id)) + '</textarea>' +
          '<button type="button" class="linkbtn pm2s-opener-btn">書き出しのヒント</button>' +
          '<span class="pm2s-opener" hidden>書き出し：「' + escapeHtml(op.head) + '」' + (op.type ? '　型：' + escapeHtml(op.type) : '') + '</span>' +
          '</span>' +
          escapeHtml(after) + '</div>' +
        '<div class="pm-panel-actions"><button type="button" class="pm2s-check" data-label="答え合わせ">答え合わせ</button></div>' +
        '<div class="pm2s-answer" hidden><b>見本の1文：</b>' + escapeHtml(sec.key) +
          (op.type ? '<div class="pm2s-note">型：' + escapeHtml(op.type) + '</div>' : '') +
          '<p class="pm2s-note">' + escapeHtml(sec.note) + '</p>' +
          '<div class="pm2s-keycopy"><label>見本の1文を打ち込む（正しい文を手で覚える）</label>' +
            '<textarea class="pm2s-keycopy-ta" rows="2" data-id="' + escapeAttr(sec.id) + '"></textarea>' +
            '<div class="pm2-count muted" data-keycount="' + escapeAttr(sec.id) + '"></div></div>' +
          stepAnswerExtrasHtml("fill", sec.id) +
        '</div>' +
      '</div>';
    }, stepKeep("fill"));
    bindStepCommon("fill", box, ".pm2s-fill", function () { renderStepFill(box, data); });
    // 見本の1文の打ち込み欄（保存はしない。見本と同じになったかだけを表示）
    var keyById = {};
    data.sections.forEach(function (x) { keyById[x.id] = x.key; });
    $all(box, ".pm2s-keycopy-ta").forEach(function (ta) {
      var key = keyById[ta.dataset.id], cnt = box.querySelector('[data-keycount="' + ta.dataset.id + '"]');
      function upd() {
        var mine = ta.value.replace(/\r?\n/g, ""), same = 0;
        while (same < mine.length && same < key.length && mine.charAt(same) === key.charAt(same)) same++;
        var done = mine === key;
        cnt.textContent = done ? "見本と同じ文になりました" :
          mine.length + " / " + key.length + " 字" + (mine.length && same < mine.length ? "（" + (same + 1) + "字目から見本と違います）" : "");
        cnt.className = "pm2-count " + (done ? "ok" : mine.length && same < mine.length ? "ng" : "muted");
      }
      ta.addEventListener("input", upd);
      upd();
    });
    $all(box, ".pm2s-opener-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var o = b.nextElementSibling;
        o.hidden = !o.hidden;
        b.textContent = o.hidden ? "書き出しのヒント" : "ヒントを隠す";
      });
    });
  }

  // 段階4: 見出しごとに書く
  function renderStepWrite(box, data) {
    var head = stepGradeHeadHtml("write", data);
    box.innerHTML = head + eachPartGroup(data, function (sec) {
      var n = stepChars(sec.text);
      return '<div class="pm2s-sec" data-id="' + escapeAttr(sec.id) + '">' +
        '<h3>' + escapeHtml(sec.id + " " + sec.head) + stepGradeTag("write", sec.id) + '<small>目安 ' + Math.round(n / 50) * 50 + '字前後</small></h3>' +
        patternHtml(sec.pattern) +
        '<div class="pm2s-partlist"><b>使える部品</b><ul>' + sec.parts.map(function (x) {
          var t = findPartText(x);
          return '<li>' + escapeHtml(t || x) + '</li>';
        }).join("") + '</ul></div>' +
        '<textarea class="pm2s-write" rows="7" data-id="' + escapeAttr(sec.id) + '" data-target="' + n + '" placeholder="組み立て方の順に書きます">' + escapeHtml(stepMine("write", sec.id)) + '</textarea>' +
        '<div class="pm2-count muted" data-count="' + escapeAttr(sec.id) + '"></div>' +
        '<div class="pm-panel-actions"><button type="button" class="pm2s-check" data-label="見本と比べる">見本と比べる</button></div>' +
        '<div class="pm2s-answer" hidden><b>見本：</b><div class="pm2s-text">' + escapeHtml(sec.text) + '</div>' +
          stepAnswerExtrasHtml("write", sec.id) +
        '</div>' +
      '</div>';
    }, stepKeep("write"));
    bindStepCommon("write", box, ".pm2s-write", function () { renderStepWrite(box, data); });
    $all(box, ".pm2s-write").forEach(function (ta) {
      var cnt = box.querySelector('[data-count="' + ta.dataset.id + '"]');
      function upd() {
        var c = stepChars(ta.value), tg = Number(ta.dataset.target);
        cnt.textContent = c + " 字（見本 " + tg + " 字）";
        cnt.className = "pm2-count " + (c === 0 ? "muted" : c >= tg * 0.8 ? "ok" : "ng");
      }
      ta.addEventListener("input", upd);
      upd();
    });
  }

  // 段階5: 骨子だけで書く（骨子タブ・執筆タブへ）
  function renderStepFinal(box) {
    box.innerHTML = '<div class="card"><div class="group-head"><h2>骨子だけで書く</h2></div>' +
      '<ol class="pm2s-final">' +
        '<li>骨子タブで、設問の言葉から見出しを作り、部品を入れる（20分）</li>' +
        '<li>執筆タブで、骨子だけを見て120分で書く（段階1〜4の見本は見ない）</li>' +
        '<li>振り返りタブでAI採点し、「次に向けたポイント」を確認する</li>' +
      '</ol>' +
      '<div class="pm-panel-actions"><button type="button" id="pm2s-go-outline">骨子タブへ</button>' +
        '<button type="button" class="primary" id="pm2s-go-write">執筆タブへ</button></div></div>';
    $("#pm2s-go-outline").addEventListener("click", function () { switchTab("outline"); });
    $("#pm2s-go-write").addEventListener("click", function () { switchTab("write"); });
  }

  function renderDrillTab(body) {
    if (!(window.DrillUI && window.DrillUI.mountSet)) {
      body.innerHTML = '<p class="pm-empty">ドリル機能を読み込めませんでした。</p>';
      return;
    }
    body.innerHTML = '<div id="pm2-drill-mount"></div>';
    var mount = $("#pm2-drill-mount");
    var q = state.q;
    state.drillEngine = window.DrillUI.mountSet(mount, {
      setId: "pm2#" + state.examId + "#" + state.no,
      title: "テーマドリル",
      questions: q.drills || []
    });
  }

  /* =====================================================================
     骨子・執筆タブ共通: 問題文の参照表示
     ===================================================================== */
  // 前文の折りたたみ表示（執筆・骨子タブの先頭に置く）
  function leadDetailsHtml() {
    return '<div class="card pm2-lead-card">' +
      '<details class="pm2-lead-details">' +
      '<summary>前文（問題文）を表示</summary>' +
      '<div class="pm2-lead">' + renderParagraphs(state.q.lead || "") + '</div>' +
      '</details></div>';
  }
  // 各入力欄の直上に出す設問文ボックス
  function setumonInlineHtml(k) {
    var qq = state.q.q || {};
    return '<div class="pm2-setumon-inline">' + escapeHtml(qq[k] || "") + '</div>';
  }

  /* =====================================================================
     骨子タブ
     ===================================================================== */
  var OUTLINE_PLACEHOLDER = {
    a: "1-1 事業概要\n1-2 事業特性と課題",
    i: "2-1 重要と考えた事項とその理由\n2-2 検討の過程と工夫",
    u: "3-1 施策の評価\n3-2 今後の改善点"
  };

  // A社の部品（js/data/pm2_parts.js）を選ぶプルダウン。選ぶとカーソル位置に「・部品」を1行で挿入する
  function partsSelectHtml(k) {
    var groups = window.PM2_PARTS || [];
    if (!groups.length) return "";
    return '<div class="pm2-parts-row"><select class="pm2-parts-sel" data-k="' + k + '" aria-label="A社の部品を挿入">' +
      '<option value="">＋ A社の部品を挿入…</option>' +
      groups.map(function (g, gi) {
        return '<optgroup label="' + escapeAttr(g.group) + '">' +
          g.items.map(function (it, ii) { return '<option value="' + gi + '-' + ii + '">' + escapeHtml(it.label) + '</option>'; }).join("") +
          '</optgroup>';
      }).join("") +
      '</select><span class="pm2-parts-help">見出しの下にカーソルを置いて選ぶと、その位置に入ります</span></div>';
  }
  function insertPart(ta, text) {
    var v = ta.value;
    var pos = typeof ta.selectionStart === "number" ? ta.selectionStart : v.length;
    var lineStart = v.lastIndexOf("\n", pos - 1) + 1;
    var lineEnd = v.indexOf("\n", pos);
    if (lineEnd < 0) lineEnd = v.length;
    var line = v.slice(lineStart, lineEnd);
    // 空行ならその行に、文字のある行ならその行の下に挿入する
    var filled = !!line.trim();
    var at = filled ? lineEnd : lineStart;
    var ins = (filled ? "\n" : "") + " ・" + text;
    ta.value = filled ? v.slice(0, at) + ins + v.slice(at) : v.slice(0, lineStart) + ins + v.slice(lineEnd);
    var caret = at + ins.length;
    ta.focus();
    ta.setSelectionRange(caret, caret);
  }

  function renderOutlineTab(body) {
    if (!state.outlineLive) state.outlineLive = { a: "", i: "", u: "" };

    body.innerHTML =
      leadDetailsHtml() +
      '<div class="card">' +
        '<div class="group-head"><h2>骨子メモ</h2></div>' +
        KEY_ORDER.map(function (k) {
          return '<div class="pm2-field">' +
            '<label class="pm2-field-label">' + KANA_LABEL[k] + 'の章立て</label>' +
            setumonInlineHtml(k) +
            partsSelectHtml(k) +
            '<textarea class="pm2-outline-ta" id="pm2-outline-' + k + '" rows="8" placeholder="' + escapeAttr(OUTLINE_PLACEHOLDER[k]) + '"></textarea>' +
          '</div>';
        }).join("") +
        '<div class="pm-panel-actions"><button type="button" class="primary" id="pm2-btn-outline-save">骨子を保存</button></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="group-head"><h2>保存した骨子（最新5件）</h2></div>' +
        '<div id="pm2-outline-versions"></div>' +
      '</div>';

    KEY_ORDER.forEach(function (k) {
      var ta = $("#pm2-outline-" + k);
      ta.value = state.outlineLive[k];
      ta.addEventListener("input", function () { state.outlineLive[k] = ta.value; });
    });
    $all(body, ".pm2-parts-sel").forEach(function (sel) {
      sel.addEventListener("change", function () {
        if (!sel.value) return;
        var ix = sel.value.split("-");
        var it = (window.PM2_PARTS[Number(ix[0])] || { items: [] }).items[Number(ix[1])];
        var ta = $("#pm2-outline-" + sel.dataset.k);
        if (it && ta) {
          insertPart(ta, it.text);
          state.outlineLive[sel.dataset.k] = ta.value;
        }
        sel.value = "";
      });
    });

    $("#pm2-btn-outline-save").addEventListener("click", function () {
      var version = { t: Date.now(), a: state.outlineLive.a, i: state.outlineLive.i, u: state.outlineLive.u };
      state.doc.outline.versions.unshift(version);
      if (state.doc.outline.versions.length > 5) state.doc.outline.versions.length = 5;
      saveDoc();
      renderOutlineVersions();
    });

    renderOutlineVersions();
  }

  function renderOutlineVersions() {
    var el = $("#pm2-outline-versions");
    if (!el) return;
    var versions = state.doc.outline.versions || [];
    if (!versions.length) {
      el.innerHTML = '<p class="pm-empty">まだ保存された骨子がありません。</p>';
      return;
    }
    el.innerHTML = '<ul class="pm2-version-list">' +
      versions.map(function (v, idx) {
        return '<li class="pm2-version-row">' +
          '<span class="pm2-version-date">' + escapeHtml(fmtDateTime(v.t)) + '</span>' +
          '<span class="pm2-version-actions">' +
            '<button type="button" class="linkbtn pm2-btn-outline-open" data-idx="' + idx + '">開く</button>' +
            '<button type="button" class="linkbtn danger pm2-btn-outline-del" data-idx="' + idx + '">削除</button>' +
          '</span>' +
        '</li>';
      }).join("") +
      '</ul>';

    $all(el, ".pm2-btn-outline-open").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.dataset.idx, 10);
        var v = state.doc.outline.versions[idx];
        if (!v) return;
        state.outlineLive = { a: v.a || "", i: v.i || "", u: v.u || "" };
        KEY_ORDER.forEach(function (k) {
          var ta = $("#pm2-outline-" + k);
          if (ta) ta.value = state.outlineLive[k];
        });
      });
    });
    $all(el, ".pm2-btn-outline-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.dataset.idx, 10);
        state.doc.outline.versions.splice(idx, 1);
        saveDoc();
        renderOutlineVersions();
      });
    });
  }

  /* =====================================================================
     執筆タブ（120分タイマー・字数カウント・自動保存・版管理）
     ===================================================================== */
  function classifyCount(len, limit) {
    if (limit.min > 0 && len < limit.min) {
      return { cls: "muted", text: len + " / " + limit.max + " 字（下限まであと" + (limit.min - len) + "字）" };
    }
    if (len > limit.max) {
      return { cls: "ng", text: len + " / " + limit.max + " 字（" + (len - limit.max) + "字超過）" };
    }
    return { cls: "ok", text: len + " / " + limit.max + " 字（適合）" };
  }
  function updateCounter(k) {
    var counter = $("#pm2-count-" + k);
    if (!counter || !state.essayLive) return;
    var len = charLen(state.essayLive[k]);
    var r = classifyCount(len, LIMITS[k]);
    counter.textContent = r.text;
    counter.className = "pm2-count " + r.cls;
  }

  function wtRemainingSec() {
    var wt = state.writeTimer;
    return wt.running ? Math.max(0, Math.round((wt.endAt - Date.now()) / 1000)) : wt.remainingSec;
  }
  function elapsedSec() {
    var wt = state.writeTimer;
    return wt.totalSec - wtRemainingSec();
  }
  function updateWriteTimerDisplay() {
    var disp = $("#pm2-write-timer-display");
    if (!disp) return;
    disp.textContent = state.writeTimer.finished ? "時間終了" : fmtClock(wtRemainingSec());
  }
  function updateWriteTimerButtons() {
    var startBtn = $("#pm2-write-timer-start");
    if (!startBtn) return;
    var toggleBtn = $("#pm2-write-timer-toggle");
    var wt = state.writeTimer;
    var lockedMidRun = wt.started && !wt.finished;
    startBtn.disabled = lockedMidRun;
    toggleBtn.disabled = !lockedMidRun;
    toggleBtn.textContent = wt.running ? "一時停止" : "再開";
  }
  function stopWriteTimerDisplayLoop() {
    var wt = state.writeTimer;
    if (wt.intervalId) { clearInterval(wt.intervalId); wt.intervalId = null; }
  }
  function startWriteTimerDisplayLoop() {
    stopWriteTimerDisplayLoop();
    var wt = state.writeTimer;
    if (wt.running) wt.intervalId = setInterval(writeTimerTick, 250);
  }
  function writeTimerTick() {
    var wt = state.writeTimer;
    if (!wt.running) return;
    var remain = Math.round((wt.endAt - Date.now()) / 1000);
    if (remain <= 0) {
      wt.running = false;
      wt.finished = true;
      wt.remainingSec = 0;
      stopWriteTimerDisplayLoop();
      updateWriteTimerButtons();
      updateWriteTimerDisplay();
      return;
    }
    updateWriteTimerDisplay();
  }
  function startWriteTimer() {
    var wt = state.writeTimer;
    if (wt.started && !wt.finished) return;
    wt.remainingSec = wt.totalSec;
    wt.endAt = Date.now() + wt.remainingSec * 1000;
    wt.running = true;
    wt.started = true;
    wt.finished = false;
    startWriteTimerDisplayLoop();
    updateWriteTimerButtons();
    updateWriteTimerDisplay();
  }
  function toggleWriteTimer() {
    var wt = state.writeTimer;
    if (!wt.started || wt.finished) return;
    if (wt.running) {
      wt.remainingSec = Math.max(0, Math.round((wt.endAt - Date.now()) / 1000));
      wt.running = false;
      stopWriteTimerDisplayLoop();
    } else {
      if (wt.remainingSec <= 0) return;
      wt.endAt = Date.now() + wt.remainingSec * 1000;
      wt.running = true;
      startWriteTimerDisplayLoop();
    }
    updateWriteTimerButtons();
    updateWriteTimerDisplay();
  }
  function resetWriteTimerClick() {
    var wt = state.writeTimer;
    stopWriteTimerDisplayLoop();
    wt.running = false;
    wt.started = false;
    wt.finished = false;
    wt.remainingSec = wt.totalSec;
    wt.endAt = null;
    updateWriteTimerButtons();
    updateWriteTimerDisplay();
  }

  function startAutosave() {
    stopAutosave();
    state.autosaveIntervalId = setInterval(function () {
      var e = state.essayLive;
      if (e && (trimStr(e.a) || trimStr(e.i) || trimStr(e.u))) saveDraft();
    }, 30000);
  }
  function stopAutosave() {
    if (state.autosaveIntervalId) { clearInterval(state.autosaveIntervalId); state.autosaveIntervalId = null; }
  }
  function saveDraft() {
    state.doc.essay.draft = {
      t: Date.now(),
      a: state.essayLive.a, i: state.essayLive.i, u: state.essayLive.u,
      sec: elapsedSec()
    };
    saveDoc();
  }
  function saveFinalVersion() {
    var version = {
      t: Date.now(),
      a: state.essayLive.a, i: state.essayLive.i, u: state.essayLive.u,
      sec: elapsedSec()
    };
    state.doc.essay.versions.unshift(version);
    if (state.doc.essay.versions.length > 5) state.doc.essay.versions.length = 5;
    state.doc.essay.draft = null; // 脱稿済みの内容を下書きとして二重に残さない
    saveDoc();
    renderEssayVersions();
  }
  function flashText(el, msg, restoreMs) {
    if (!el) return;
    var original = el.textContent;
    el.textContent = msg;
    setTimeout(function () { if (el) el.textContent = original; }, restoreMs || 1500);
  }

  // 執筆タブ: CBT形式の全画面で論述する。タブ自体には再開用の案内と保存した版の一覧を置く
  // 脱稿済みか: 版があり、その後の下書きがない（脱稿保存で下書きを消す）。書き直しを始めたら未完了に戻す
  function writeSubmitted() {
    return !state.writeRestarted && !state.doc.essay.draft && (state.doc.essay.versions || []).length > 0;
  }
  function stopWriteTimerAtFinish() {
    var wt = state.writeTimer;
    if (wt.running) {
      wt.remainingSec = Math.max(0, Math.round((wt.endAt - Date.now()) / 1000));
      wt.running = false;
    }
    stopWriteTimerDisplayLoop();
  }
  // 書き直しを始める: 入力欄（空 or 指定した版）を用意し、タイマーを120分に戻す
  function restartWrite(essay) {
    state.essayLive = { a: (essay && essay.a) || "", i: (essay && essay.i) || "", u: (essay && essay.u) || "" };
    state.essayLiveInit = true;
    state.writeRestarted = true;
    var wt = state.writeTimer;
    stopWriteTimerDisplayLoop();
    wt.running = false; wt.started = false; wt.finished = false; wt.remainingSec = wt.totalSec; wt.endAt = null;
  }

  function renderWriteTab(body) {
    if (writeSubmitted()) {
      var v = state.doc.essay.versions[0];
      var vt = KEY_ORDER.reduce(function (n, k) { return n + charLen(v[k]); }, 0);
      body.innerHTML =
        '<div class="card">' +
          '<div class="group-head"><h2>執筆（CBT形式・120分）</h2><span class="spacer"></span><span class="pm1x-done-badge">脱稿済み</span></div>' +
          '<p class="stats-note">' + escapeHtml(fmtDateTime(v.t)) + 'に脱稿しました。計 ' + vt + ' 字・所要 ' + escapeHtml(fmtElapsed(v.sec)) +
            '。「振り返り」タブでチェックリストとAI採点ができます。</p>' +
          '<div class="pm-panel-actions">' +
            '<button type="button" id="pm2-restart">白紙から書き直す（120分）</button>' +
            '<button type="button" class="primary" id="pm2-to-review">振り返りへ &rarr;</button>' +
          '</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="group-head"><h2>保存した版（最新5件）</h2></div>' +
          '<p class="stats-note">「開く」で過去の版を読み込み、続きから書き直せます（タイマーは120分に戻ります）。</p>' +
          '<div id="pm2-essay-versions"></div>' +
        '</div>';
      $("#pm2-to-review").addEventListener("click", function () { switchTab("review"); });
      $("#pm2-restart").addEventListener("click", function () {
        if (!confirm("入力欄を空にして、120分のタイマーで書き直します。脱稿した論文は保存済みの版として残ります。よろしいですか？")) return;
        restartWrite(null);
        renderTabBody();
        openWriteCbt();
      });
      renderEssayVersions();
      state.cbtShownOnce = true;
      return;
    }
    if (!state.essayLiveInit) {
      var d = state.doc.essay.draft;
      state.essayLive = { a: (d && d.a) || "", i: (d && d.i) || "", u: (d && d.u) || "" };
      state.essayLiveInit = true;
    }
    var total = KEY_ORDER.reduce(function (n, k) { return n + charLen(state.essayLive[k]); }, 0);
    var wt = state.writeTimer;
    body.innerHTML =
      '<div class="card">' +
        '<div class="group-head"><h2>執筆（CBT形式・120分）</h2></div>' +
        '<p class="stats-note">本番のCBTと同じく、左に問題文、右に設問ア・イ・ウの入力欄を並べた全画面で論述します。' +
          '問題文へのマーカー、メモ、電卓、白黒反転、拡大・縮小が使えます。</p>' +
        '<p class="stats-note">入力中の論文は30秒ごとに自動で下書き保存されます。「確認終了」で脱稿として保存し、振り返りに進みます。</p>' +
        '<div class="pm-panel-actions">' +
          '<span class="pm2-save-status">現在 計' + total + '字' +
            (wt.started ? '・残り ' + (wt.finished ? '0:00' : fmtClock(wtRemainingSec())) : '') + '</span>' +
          '<button type="button" class="primary" id="pm2-cbt-open">' + (total || wt.started ? '執筆を再開する' : '執筆を開始する') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="group-head"><h2>保存した版（最新5件）</h2></div>' +
        '<p class="stats-note">「開く」で過去の版を入力欄に読み込み、続きから書き直せます。</p>' +
        '<div id="pm2-essay-versions"></div>' +
      '</div>';
    $("#pm2-cbt-open").addEventListener("click", openWriteCbt);
    renderEssayVersions();
    if (!state.cbtShownOnce) { state.cbtShownOnce = true; openWriteCbt(); }
  }

  function openWriteCbt() {
    if ($("#pm2-cbt")) return;
    var q = state.q, qq = q.q || {};
    var html = '<div class="cbt" id="pm2-cbt" data-cbt-key="pm" data-cbt-split="55">' +
      '<div class="cbt-top">' +
        '<div class="cbt-title">' +
          '<div class="cbt-exam">' + escapeHtml(state.exam.examLabel) + '　午後II 問' + q.no + '　' + escapeHtml(displayTitleFor(state.exam, q)) + '</div>' +
          '<div class="cbt-progress">午後II 論述</div>' +
        '</div>' +
        '<div class="cbt-tools">' +
          '<label class="cbt-invert" title="白黒反転表示に切り替えます"><span>白黒反転</span>' +
            '<input type="checkbox" role="switch"><span class="cbt-switch" aria-hidden="true"></span></label>' +
          '<button type="button" class="cbt-btn cbt-blue" data-cbt-open="memo">メモ</button>' +
          '<button type="button" class="cbt-btn cbt-gray" id="pm2-cbt-close" title="下書きを保存して執筆画面を閉じます">中断</button>' +
          '<button type="button" class="cbt-btn cbt-red" id="pm2-btn-final-save" title="脱稿として保存し、振り返りに進みます">確認終了</button>' +
        '</div>' +
        '<div class="cbt-time">残り時間 <b id="pm2-write-timer-display"></b>' +
          '<span class="cbt-timer-ctl">' +
            '<button type="button" id="pm2-write-timer-start" title="120分のタイマーを開始">開始</button>' +
            '<button type="button" id="pm2-write-timer-toggle">一時停止</button>' +
            '<button type="button" id="pm2-write-timer-reset" title="タイマーを120分に戻す">リセット</button>' +
          '</span></div>' +
      '</div>' +
      '<div class="cbt-main">' +
        '<div class="cbt-left">' +
          '<div class="cbt-zoom"><label>拡大・縮小</label><input type="range" min="80" max="200" step="10" value="100" aria-label="拡大・縮小"><b class="cbt-zoom-val">100%</b>' +
            (window.CBT ? window.CBT.markerToolsHtml() : "") + '</div>' +
          '<div class="cbt-q cbt-markable">' +
            '<div class="pm2-lead">' + renderParagraphs(q.lead) + '</div>' +
            KEY_ORDER.map(function (k) {
              return '<div class="pm2cbt-setumon"><b>' + KANA_LABEL[k] + '</b>（' + escapeHtml(LIMITS[k].label) + '）<div>' + escapeHtml(qq[k] || "（未収録）") + '</div></div>';
            }).join("") +
          '</div>' +
        '</div>' +
        '<div class="cbt-splitter" role="separator" aria-orientation="vertical" title="ドラッグで左右の幅を変更"></div>' +
        '<div class="cbt-right">' +
          KEY_ORDER.map(function (k) {
            return '<div class="pm2-field pm2cbt-field">' +
              '<label class="pm2-field-label" for="pm2-essay-' + k + '">' + KANA_LABEL[k] + '（' + escapeHtml(LIMITS[k].label) + '）</label>' +
              '<textarea class="pm2-essay-ta pm2cbt-ta pm2cbt-ta-' + k + '" id="pm2-essay-' + k + '"></textarea>' +
              '<div class="pm2-count" id="pm2-count-' + k + '"></div>' +
            '</div>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<div class="cbt-bottom">' +
        '<button type="button" class="cbt-btn cbt-gray" data-cbt-open="calc">電卓</button>' +
        '<span class="cbt-ratio" role="group" aria-label="問題文と入力欄の比率">' +
          '<button type="button" class="cbt-ratio-btn" data-r="problem">問題文</button>' +
          '<button type="button" class="cbt-ratio-btn" data-r="half">半々</button>' +
          '<button type="button" class="cbt-ratio-btn" data-r="answer">入力欄</button>' +
        '</span>' +
        '<span class="spacer"></span>' +
        '<span class="cbt-answered" id="pm2-draft-status"></span>' +
        '<button type="button" class="cbt-btn cbt-teal" id="pm2-btn-draft-save">下書きを保存</button>' +
      '</div>' +
    '</div>';
    root.insertAdjacentHTML("beforeend", html);
    document.body.classList.add("cbt-mode");
    state.cbt = window.CBT ? window.CBT.mount($("#pm2-cbt")) : null;

    KEY_ORDER.forEach(function (k) {
      var ta = $("#pm2-essay-" + k);
      ta.value = state.essayLive[k];
      updateCounter(k);
      ta.addEventListener("input", function () {
        state.essayLive[k] = ta.value;
        updateCounter(k);
      });
    });
    $("#pm2-btn-draft-save").addEventListener("click", function () {
      saveDraft();
      flashText($("#pm2-draft-status"), "下書きを保存しました");
    });
    $("#pm2-btn-final-save").addEventListener("click", function () {
      if (!confirm("脱稿として保存し、振り返りに進みます。よろしいですか？")) return;
      saveFinalVersion(); // 下書きは消える（脱稿済み）
      stopWriteTimerAtFinish();
      state.writeRestarted = false;
      closeWriteCbt();
      switchTab("review");
    });
    $("#pm2-cbt-close").addEventListener("click", function () {
      saveDraft();
      closeWriteCbt();
      renderTabBody();
    });
    $("#pm2-write-timer-start").addEventListener("click", startWriteTimer);
    $("#pm2-write-timer-toggle").addEventListener("click", toggleWriteTimer);
    $("#pm2-write-timer-reset").addEventListener("click", resetWriteTimerClick);
    if (!state.writeTimer.started) startWriteTimer(); // CBTと同じく開いた時点で計時を始める（一時停止・リセット可）
    updateWriteTimerButtons();
    updateWriteTimerDisplay();
    startWriteTimerDisplayLoop();
    startAutosave();
  }

  function closeWriteCbt() {
    var el = $("#pm2-cbt");
    if (!el) return;
    stopAutosave();
    stopWriteTimerDisplayLoop();
    if (state.cbt) state.cbt.close();
    state.cbt = null;
    el.parentNode.removeChild(el);
    document.body.classList.remove("cbt-mode");
  }

  function renderEssayVersions() {
    var el = $("#pm2-essay-versions");
    if (!el) return;
    var versions = state.doc.essay.versions || [];
    if (!versions.length) {
      el.innerHTML = '<p class="pm-empty">まだ保存された版がありません。</p>';
      return;
    }
    el.innerHTML = '<ul class="pm2-version-list">' +
      versions.map(function (v, idx) {
        var total = charLen(v.a) + charLen(v.i) + charLen(v.u);
        return '<li class="pm2-version-row">' +
          '<span class="pm2-version-date">' + escapeHtml(fmtDateTime(v.t)) + '</span>' +
          '<span class="pm2-version-meta">計' + total + '字・経過' + escapeHtml(fmtElapsed(v.sec)) + '</span>' +
          '<span class="pm2-version-actions">' +
            '<button type="button" class="linkbtn pm2-btn-essay-open" data-idx="' + idx + '">開く</button>' +
            '<button type="button" class="linkbtn danger pm2-btn-essay-del" data-idx="' + idx + '">削除</button>' +
          '</span>' +
        '</li>';
      }).join("") +
      '</ul>';

    $all(el, ".pm2-btn-essay-open").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.dataset.idx, 10);
        var v = state.doc.essay.versions[idx];
        if (!v) return;
        if (writeSubmitted()) {
          // 脱稿済みの画面から版を開いたら、その版で書き直しを始める
          restartWrite(v);
          renderTabBody();
          return;
        }
        state.essayLive = { a: v.a || "", i: v.i || "", u: v.u || "" };
        KEY_ORDER.forEach(function (k) {
          var ta = $("#pm2-essay-" + k);
          if (ta) { ta.value = state.essayLive[k]; updateCounter(k); }
        });
      });
    });
    $all(el, ".pm2-btn-essay-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.dataset.idx, 10);
        state.doc.essay.versions.splice(idx, 1);
        saveDoc();
        renderEssayVersions();
      });
    });
  }

  /* =====================================================================
     振り返りタブ
     ===================================================================== */
  function getLatestEssayForPrompt() {
    var live = state.essayLive;
    if (live && (trimStr(live.a) || trimStr(live.i) || trimStr(live.u))) return live;
    var d = state.doc.essay.draft;
    if (d && (trimStr(d.a) || trimStr(d.i) || trimStr(d.u))) return d;
    var versions = state.doc.essay.versions || [];
    if (versions.length) return versions[0];
    return null;
  }

  function buildAiPrompt(essay) {
    var q = state.q;
    var qq = q.q || {};
    var lines = [];
    lines.push("あなたはITストラテジスト試験 午後II（論述式）の採点者です。以下の論文を、IPAが公表する評価基準（A〜Dの4段階評価。Aが合格水準）に基づいて採点してください。");
    lines.push("");
    lines.push("■テーマ: " + displayTitleFor(state.exam, q));
    lines.push("");
    lines.push("■問題文（前文）:");
    lines.push(q.lead || "");
    lines.push("");
    lines.push("■設問ア（" + LIMITS.a.label + "）:");
    lines.push(qq.a || "");
    lines.push("");
    lines.push("■設問イ（" + LIMITS.i.label + "）:");
    lines.push(qq.i || "");
    lines.push("");
    lines.push("■設問ウ（" + LIMITS.u.label + "）:");
    lines.push(qq.u || "");
    lines.push("");
    lines.push("■出題趣旨（採点観点として参照してください）:");
    lines.push(q.shushi || "（なし）");
    lines.push("");
    lines.push("■あなたの論文:");
    lines.push("【設問ア】");
    lines.push(essay.a || "");
    lines.push("");
    lines.push("【設問イ】");
    lines.push(essay.i || "");
    lines.push("");
    lines.push("【設問ウ】");
    lines.push(essay.u || "");
    lines.push("");
    lines.push("■出力してほしい内容:");
    lines.push("1. 設問ア・イ・ウそれぞれについての評価（A〜D）と、その根拠");
    lines.push("2. 出題趣旨とのギャップ（出題趣旨が求める観点に対し、論文で不足している点）");
    lines.push("3. 改善点（具体的に）");
    lines.push("4. 設問イの改善リライト例");
    lines.push("");
    lines.push("全体のまとめとして、見出し「次に向けたポイント」の下に、次の論文で意識すべきことを3つ、箇条書き（1行1項目）で出力してください。");
    lines.push("");
    lines.push("最後に、次の形式で評価一覧を1行で出力してください（アプリが読み取ります）:");
    lines.push("評価一覧: 設問ア=B, 設問イ=B, 設問ウ=B, 総合=B");
    return lines.join("\n");
  }

  // AI採点の結果から設問ア・イ・ウと総合の評価（A〜D）を読み取る
  var EVAL_KEYS = [["a", "設問ア"], ["i", "設問イ"], ["u", "設問ウ"], ["total", "総合"]];
  function normEval(t) {
    return String(t || "").replace(/[Ａ-Ｄ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[ 　\t*]/g, "");
  }
  function aiEvalFrom(text) {
    var out = {}, t = normEval(text);
    if (!t) return out;
    var m = /評価一覧[:：]?([^\n]*)/.exec(t);
    if (m) {
      EVAL_KEYS.forEach(function (k) {
        var r = new RegExp(k[1] + "[=＝:：]([A-D])").exec(m[1]);
        if (r) out[k[0]] = r[1];
      });
      if (Object.keys(out).length) return out;
    }
    var lines = t.split("\n");
    EVAL_KEYS.forEach(function (k) {
      var label = k[0] === "total" ? /(総合|全体)評価|総合[:：]|総評/ : new RegExp(k[1]);
      for (var i = 0; i < lines.length; i++) {
        if (!label.test(lines[i])) continue;
        var chunk = lines.slice(i, i + 4).join("\n");
        var r = /評価[:：]?\n?([A-D])(?![a-z])/.exec(chunk) || /[:：（(]([A-D])[)）]?(?:評価|ランク|$|\n)/.exec(chunk) || /([A-D])(?:評価|ランク)/.exec(chunk);
        if (r) { out[k[0]] = r[1]; break; }
      }
    });
    return out;
  }
  function selfEval() {
    if (!state.doc.check.self || typeof state.doc.check.self !== "object") state.doc.check.self = {};
    return state.doc.check.self;
  }
  function evalTableHtml() {
    var self = selfEval(), ai = aiEvalFrom(state.doc.check.ai);
    return '<table class="pm2-eval"><thead><tr><th></th><th>自分の評価</th><th>AI評価</th><th></th></tr></thead><tbody>' +
      EVAL_KEYS.map(function (k) {
        var mine = self[k[0]] || "", a = ai[k[0]] || "";
        return '<tr' + (k[0] === "total" ? ' class="total"' : '') + '><th>' + k[1] + '</th>' +
          '<td><select class="pm2-self-eval" data-k="' + k[0] + '">' +
            ['', 'A', 'B', 'C', 'D'].map(function (g) { return '<option value="' + g + '"' + (mine === g ? ' selected' : '') + '>' + (g || '未評価') + '</option>'; }).join("") +
          '</select></td>' +
          '<td class="pm2-ai-eval">' + (a ? '<b>' + a + '</b>' : '－') + '</td>' +
          '<td>' + (a && mine ? (a === mine ? '<span class="pm2-eval-same">一致</span>' : '<span class="pm1-ai-diff">自分と違う</span>') : '') + '</td></tr>';
      }).join("") +
      '</tbody></table>';
  }
  function updateEvalTable() {
    var box = $("#pm2-eval-box");
    if (!box) return;
    box.innerHTML = evalTableHtml();
    bindEvalSelects();
    updateNextBox();
  }
  function updateNextBox() {
    var nx = $("#pm2-next");
    if (nx && window.PmNext) nx.innerHTML = window.PmNext.html(window.PmNext.from(state.doc.check.ai), "「演習記録に保存」を押すと、午後IIの一覧にも表示されます。");
  }
  function bindEvalSelects() {
    $all($("#pm2-eval-box"), ".pm2-self-eval").forEach(function (sel) {
      sel.addEventListener("change", function () {
        selfEval()[sel.dataset.k] = sel.value;
        state.doc.check.t = Date.now();
        saveDoc();
        updateEvalTable();
      });
    });
  }

  function renderReviewTab(body) {
    var items = state.doc.check.items || {};
    var essay = getLatestEssayForPrompt();

    body.innerHTML =
      '<div class="card">' +
        '<div class="group-head"><h2>評価（自分とAI）</h2></div>' +
        '<p class="stats-note">IPAの評価はA（合格水準）〜Dの4段階です。自分の評価を付け、AI採点の結果を下に貼り付けると、AIの評価が並んで表示されます。自分の評価はAIで上書きされません。</p>' +
        '<div id="pm2-eval-box">' + evalTableHtml() + '</div>' +
        '<h3 class="pm-next-head">次に向けたポイント（AI採点から）</h3><div id="pm2-next"></div>' +
        '<div class="pm-panel-actions"><span class="pm2-save-status" id="pm2-record-status"></span>' +
          '<button type="button" class="primary" id="pm2-btn-save-record">演習記録に保存</button></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="group-head"><h2>セルフチェックリスト</h2></div>' +
        '<ul class="pm2-checklist">' +
          CHECK_ITEMS.map(function (item, idx) {
            return '<li><label class="pm2-check-row"><input type="checkbox" class="pm2-check-box" data-id="' + item.id + '"' +
              (items[item.id] ? ' checked' : '') + '><span>' + (idx + 1) + '. ' + escapeHtml(item.label) + '</span></label></li>';
          }).join("") +
        '</ul>' +
      '</div>' +
      '<div class="card">' +
        '<div class="group-head"><h2>AI添削</h2></div>' +
        '<div class="pm2-ai-actions">' +
          '<button type="button" class="primary" id="pm2-btn-copy-prompt"' + (essay ? '' : ' disabled') + '>AI添削依頼文をコピー</button>' +
          '<span class="pm2-copy-status" id="pm2-copy-status"></span>' +
        '</div>' +
        (essay ? '' : '<p class="pm-empty">※論文が未入力です</p>') +
        '<label class="pm2-field-label">AI採点結果の貼り付け欄</label>' +
        '<textarea class="pm2-ai-result" id="pm2-ai-result" rows="8" placeholder="AIから返ってきた採点結果をここに貼り付けて保存できます"></textarea>' +
      '</div>';

    $all(body, ".pm2-check-box").forEach(function (cb) {
      cb.addEventListener("change", function () {
        state.doc.check.items[cb.dataset.id] = cb.checked;
        state.doc.check.t = Date.now();
        saveDoc();
      });
    });

    bindEvalSelects();
    updateNextBox();
    $("#pm2-btn-save-record").addEventListener("click", function () {
      var self = selfEval(), ai = aiEvalFrom(state.doc.check.ai);
      var v = (state.doc.essay.versions || [])[0];
      var rec = { s: "done", g: self.total || "", m: v && v.sec ? Math.round(v.sec / 60) : 0, note: "", t: Date.now() };
      if (ai.total || ai.a || ai.i || ai.u) {
        rec.ai = (ai.total ? "総合" + ai.total : "") + "(" + ["a", "i", "u"].map(function (k) { return ({ a: "ア", i: "イ", u: "ウ" })[k] + (ai[k] || "-"); }).join("") + ")";
      }
      var nextPts = window.PmNext ? window.PmNext.from(state.doc.check.ai) : [];
      if (nextPts.length) rec.next = nextPts.slice(0, 3); // 次に向けたポイント（一覧に表示）
      var key = state.examId + "#pm2#" + state.no;
      if (window.STSync && window.STSync.active() && window.STSync.setPmRecord) window.STSync.setPmRecord(key, rec);
      else {
        var r;
        try { r = JSON.parse(localStorage.getItem("st_pm_records_v1")) || {}; } catch (e) { r = {}; }
        r[key] = rec;
        try { localStorage.setItem("st_pm_records_v1", JSON.stringify(r)); } catch (e) { /* ignore */ }
      }
      flashText($("#pm2-record-status"), "演習記録に保存しました");
    });

    var aiTa = $("#pm2-ai-result");
    aiTa.value = state.doc.check.ai || "";
    aiTa.addEventListener("input", function () { state.doc.check.ai = aiTa.value; updateEvalTable(); });
    aiTa.addEventListener("change", function () {
      state.doc.check.ai = aiTa.value;
      state.doc.check.t = Date.now();
      saveDoc();
    });

    var copyBtn = $("#pm2-btn-copy-prompt");
    if (copyBtn && essay) {
      copyBtn.addEventListener("click", function () {
        var text = buildAiPrompt(essay);
        copyText(text).then(function () {
          flashText($("#pm2-copy-status"), "コピーしました", 2000);
        }).catch(function () {
          flashText($("#pm2-copy-status"), "コピーに失敗しました", 2000);
        });
      });
    }
  }

  /* =====================================================================
     画面の骨格・タブ切替
     ===================================================================== */
  function teardownTabResources(tab) {
    if (!state) return;
    if (tab === "write") {
      if ($("#pm2-cbt")) saveDraft();
      closeWriteCbt();
      stopAutosave();
      stopWriteTimerDisplayLoop();
    } else if ((tab === "drill" || tab === "steps") && state.drillEngine) {
      state.drillEngine.destroy();
      state.drillEngine = null;
    }
  }

  function renderTabBody() {
    var body = $("#pm2-tabbody");
    if (!body) return;
    if (state.activeTab === "problem") renderProblemTab(body);
    else if (state.activeTab === "drill") renderDrillTab(body);
    else if (state.activeTab === "steps") renderStepsTab(body);
    else if (state.activeTab === "outline") renderOutlineTab(body);
    else if (state.activeTab === "write") renderWriteTab(body);
    else if (state.activeTab === "review") renderReviewTab(body);
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
      '<div id="pm2-warning" class="pm2-warning" hidden></div>' +
      '<div class="card pm2-head-card">' +
        '<div class="group-head"><button type="button" class="linkbtn" id="pm2-btn-back">&larr; 一覧へ戻る</button></div>' +
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
      '<div id="pm2-tabbody"></div>';

    $("#pm2-btn-back").addEventListener("click", closeStudy);
    $all(root, ".pm2-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { switchTab(btn.dataset.tab); });
    });

    updateTabButtons();
    renderCloudWarning();
    renderTabBody();
  }

  /* ---------- 起動・終了 ---------- */
  // tab: 最初に開くタブ（練習スケジュールの「開く」から段階学習・骨子・執筆へ直接移るため。省略時は問題文）
  function open(examId, no, tab) {
    var exam = findExam(examId);
    var q = findThemeQuestion(examId, no);
    if (!exam || !q) return; // データが無い場合は何もしない（学習ボタンはpm.js側で該当時のみ表示）

    if (state) teardownTabResources(state.activeTab);

    state = newState(examId, no, exam, q);
    state.stepSess = null;
    if (tab && TABS.some(function (t) { return t.id === tab; })) state.activeTab = tab;
    var themeKey = state.themeKey;

    pmMain.hidden = true;
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

  window.PM2Study = { open: open };
})();
