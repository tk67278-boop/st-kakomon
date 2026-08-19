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

  function renderExerciseTab(body) {
    ensureAnsLive();

    var html = '<div class="card pm2-timer-card">' +
      '<div class="group-head"><h2>演習タイマー（45分）</h2><span class="spacer"></span>' +
        '<span id="pm1-ex-timer-display" class="pm-timer-display"></span></div>' +
      '<div class="pm2-timer-actions">' +
        '<button type="button" class="primary" id="pm1-ex-timer-start">開始</button>' +
        '<button type="button" id="pm1-ex-timer-toggle">一時停止</button>' +
        '<button type="button" id="pm1-ex-timer-reset">リセット</button>' +
      '</div>' +
    '</div>';

    html += '<div class="card">';
    state.flat.forEach(function (fp) {
      if (fp.isFirstInSetsumon) {
        html += '<div class="pm2-setumon-inline">' + escapeHtml(fp.setsumon.label || "") +
          '　' + escapeHtml(fp.setsumon.text || "") + '</div>';
      }
      var limitSuffix = fp.part.limit ? '（' + escapeHtml(String(fp.part.limit)) + '字以内）' : '';
      html += '<div class="pm2-field">' +
        '<label class="pm2-field-label">' + escapeHtml(fp.part.label || "") + limitSuffix + '</label>' +
        '<textarea class="pm1-ans-ta" id="pm1-ans-' + fp.idx + '" rows="4"></textarea>' +
        '<div class="pm2-count" id="pm1-count-' + fp.idx + '"></div>' +
      '</div>';
    });
    html += '<div class="pm-panel-actions">' +
      '<span class="pm2-save-status" id="pm1-draft-status"></span>' +
      '<button type="button" id="pm1-btn-draft-save">下書きを保存</button>' +
      '<button type="button" class="primary" id="pm1-btn-compare">解答例と対比する &rarr;</button>' +
    '</div></div>';

    body.innerHTML = html;

    state.flat.forEach(function (fp) {
      var ta = $("#pm1-ans-" + fp.idx);
      ta.value = state.ansLive[fp.idx] || "";
      updateAnsCounter(fp);
      ta.addEventListener("input", function () {
        state.ansLive[fp.idx] = ta.value;
        updateAnsCounter(fp);
      });
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
        '<div class="group-head"><h3>' + escapeHtml(fp.part.label || "") + '</h3></div>' +
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
