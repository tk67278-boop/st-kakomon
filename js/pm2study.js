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
      check: { items: {}, ai: "", t: 0 }
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
    if (data.check) {
      if (data.check.items && typeof data.check.items === "object") d.check.items = data.check.items;
      if (typeof data.check.ai === "string") d.check.ai = data.check.ai;
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
            '<textarea class="pm2-outline-ta" id="pm2-outline-' + k + '" rows="5" placeholder="' + escapeAttr(OUTLINE_PLACEHOLDER[k]) + '"></textarea>' +
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
      return { cls: "muted", text: len + "字（あと" + (limit.min - len) + "字）" };
    }
    if (len > limit.max) {
      return { cls: "ng", text: len + "字（" + (len - limit.max) + "字超過）" };
    }
    return { cls: "ok", text: len + "字（適合）" };
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

  function renderWriteTab(body) {
    if (!state.essayLiveInit) {
      var d = state.doc.essay.draft;
      state.essayLive = { a: (d && d.a) || "", i: (d && d.i) || "", u: (d && d.u) || "" };
      state.essayLiveInit = true;
    }

    body.innerHTML =
      '<div class="card pm2-timer-card">' +
        '<div class="group-head"><h2>執筆タイマー（120分）</h2><span class="spacer"></span>' +
          '<span id="pm2-write-timer-display" class="pm-timer-display"></span></div>' +
        '<div class="pm2-timer-actions">' +
          '<button type="button" class="primary" id="pm2-write-timer-start">開始</button>' +
          '<button type="button" id="pm2-write-timer-toggle">一時停止</button>' +
          '<button type="button" id="pm2-write-timer-reset">リセット</button>' +
        '</div>' +
      '</div>' +
      leadDetailsHtml() +
      '<div class="card">' +
        KEY_ORDER.map(function (k) {
          return '<div class="pm2-field pm2-essay-field">' +
            '<label class="pm2-field-label">' + KANA_LABEL[k] + '（' + escapeHtml(LIMITS[k].label) + '）</label>' +
            setumonInlineHtml(k) +
            '<textarea class="pm2-essay-ta" id="pm2-essay-' + k + '"></textarea>' +
            '<div class="pm2-count" id="pm2-count-' + k + '"></div>' +
          '</div>';
        }).join("") +
        '<div class="pm-panel-actions">' +
          '<span class="pm2-save-status" id="pm2-draft-status"></span>' +
          '<button type="button" id="pm2-btn-draft-save">下書きを保存</button>' +
          '<button type="button" class="primary" id="pm2-btn-final-save">脱稿として保存</button>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="group-head"><h2>保存した版（最新5件）</h2></div>' +
        '<div id="pm2-essay-versions"></div>' +
      '</div>';

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
      saveFinalVersion();
      flashText($("#pm2-draft-status"), "脱稿として保存しました");
    });

    renderEssayVersions();

    $("#pm2-write-timer-start").addEventListener("click", startWriteTimer);
    $("#pm2-write-timer-toggle").addEventListener("click", toggleWriteTimer);
    $("#pm2-write-timer-reset").addEventListener("click", resetWriteTimerClick);
    updateWriteTimerButtons();
    updateWriteTimerDisplay();
    startWriteTimerDisplayLoop();

    startAutosave();
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
    return lines.join("\n");
  }

  function renderReviewTab(body) {
    var items = state.doc.check.items || {};
    var essay = getLatestEssayForPrompt();

    body.innerHTML =
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

    var aiTa = $("#pm2-ai-result");
    aiTa.value = state.doc.check.ai || "";
    aiTa.addEventListener("input", function () { state.doc.check.ai = aiTa.value; });
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
      stopAutosave();
      stopWriteTimerDisplayLoop();
    } else if (tab === "drill" && state.drillEngine) {
      state.drillEngine.destroy();
      state.drillEngine = null;
    }
  }

  function renderTabBody() {
    var body = $("#pm2-tabbody");
    if (!body) return;
    if (state.activeTab === "problem") renderProblemTab(body);
    else if (state.activeTab === "drill") renderDrillTab(body);
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
  function open(examId, no) {
    var exam = findExam(examId);
    var q = findThemeQuestion(examId, no);
    if (!exam || !q) return; // データが無い場合は何もしない（学習ボタンはpm.js側で該当時のみ表示）

    if (state) teardownTabResources(state.activeTab);

    state = newState(examId, no, exam, q);
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
