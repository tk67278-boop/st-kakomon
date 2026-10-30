/* ST 午後I・午後II 過去問トレーナー（一覧・演習記録・タイマー） */
(function () {
  "use strict";

  var PM_KEY = "st_pm_records_v1";
  var MODE_KEY = "st_mode_v1";

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  if (!$("#mode-pm")) return; // 想定外のDOM構成の場合は安全に何もしない

  /* ---------- データ ---------- */
  var EXAMS = (window.PM_INDEX || []).slice().sort(function (a, b) {
    return a.examId < b.examId ? -1 : 1;
  });

  var STATUS_LABEL = { todo: "未着手", done: "演習済", review: "要復習" };

  var currentMode = "am2"; // "am2" | "pm1" | "pm2"
  var filters = { industry: "all", theme: "all", status: "all" };

  /* ---------- ユーティリティ ---------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }
  function recKey(examId, mode, no) {
    return examId + "#" + mode + "#" + no;
  }
  // 午後II学習画面（js/pm2study.js）用データの参照。データが無い年度・問はnullを返す
  // （window.PM2_TEXT は該当データファイル読み込み時にのみ examId キーで生える）。
  function pm2TextFor(examId, no) {
    var theme = window.PM2_TEXT && window.PM2_TEXT[examId];
    if (!theme || !theme.questions) return null;
    var found = null;
    theme.questions.forEach(function (tq) { if (tq.no === no) found = tq; });
    return found;
  }
  // 午後I学習画面（js/pm1study.js）用データの参照。データが無い年度・問はnullを返す
  // （window.PM1_TEXT は該当データファイル読み込み時にのみ examId キーで生える）。
  function pm1TextFor(examId, no) {
    var theme = window.PM1_TEXT && window.PM1_TEXT[examId];
    if (!theme || !theme.questions) return null;
    var found = null;
    theme.questions.forEach(function (tq) { if (tq.no === no) found = tq; });
    return found;
  }

  /* ---------- 演習記録 (localStorage / STSync) ---------- */
  function syncActive() {
    return !!(window.STSync && window.STSync.active());
  }
  function loadRecords() {
    if (syncActive() && window.STSync.getPm) return window.STSync.getPm();
    try { return JSON.parse(localStorage.getItem(PM_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveRecordsLocal(records) {
    try { localStorage.setItem(PM_KEY, JSON.stringify(records)); } catch (e) { /* ignore */ }
  }
  function saveRecord(key, rec) {
    if (syncActive() && window.STSync.setPmRecord) {
      window.STSync.setPmRecord(key, rec);
    } else {
      var records = loadRecords();
      records[key] = rec;
      saveRecordsLocal(records);
    }
  }
  function statusOf(records, key) {
    var r = records[key];
    return (r && r.s) ? r.s : "todo";
  }

  /* ---------- 一覧の平坦化 ---------- */
  function itemsForMode(mode) {
    var items = [];
    EXAMS.forEach(function (exam) {
      var pm = exam[mode];
      if (!pm) return;
      pm.questions.forEach(function (q) {
        items.push({ exam: exam, q: q, key: recKey(exam.examId, mode, q.no) });
      });
    });
    return items;
  }

  /* ---------- モード切替 ---------- */
  function bindModeTabs() {
    $$(".mode-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.dataset.mode === currentMode) return;
        switchMode(btn.dataset.mode);
      });
    });
  }

  function switchMode(mode) {
    currentMode = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* ignore */ }

    $$(".mode-tab").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    if (mode === "am2") {
      $("#mode-am2").hidden = false;
      $("#mode-pm").hidden = true;
      $("#mode-terms").hidden = true;
      $("#mode-textbook").hidden = true;
    } else if (mode === "terms") {
      $("#mode-am2").hidden = true;
      $("#mode-pm").hidden = true;
      $("#mode-terms").hidden = false;
      $("#mode-textbook").hidden = true;
      if (window.TermsUI) window.TermsUI.onShow();
    } else if (mode === "textbook") {
      $("#mode-am2").hidden = true;
      $("#mode-pm").hidden = true;
      $("#mode-terms").hidden = true;
      $("#mode-textbook").hidden = false;
      if (window.TextbookUI) window.TextbookUI.onShow();
    } else {
      $("#mode-am2").hidden = true;
      $("#mode-pm").hidden = false;
      $("#mode-terms").hidden = true;
      $("#mode-textbook").hidden = true;
      filters = { industry: "all", theme: "all", status: "all" };
      $("#pm-heading").textContent = mode === "pm1" ? "午後I 過去問" : "午後II 過去問";
      // 解き方ガイド（summary/ の1ページ資料）へのリンクを午後I・IIで切り替える
      var caseLink = $("#pm-case-link");
      if (caseLink) caseLink.hidden = mode !== "pm2"; // 午後IIだけ事例設定シートを表示
      var paraLink = $("#pm-para-link");
      if (paraLink) paraLink.hidden = mode !== "pm2"; // 午後IIだけ段落練習（js/pm2para.js）を表示
      var storyLink = $("#pm-story-link");
      if (storyLink) storyLink.hidden = mode !== "pm2"; // 午後IIだけ「漫画で覚えるA社」を表示
      var textLink = $("#pm-text-link");
      if (textLink) textLink.hidden = mode !== "pm2"; // 午後IIだけ「午後II 教科書」を表示
      if (window.PmPara) window.PmPara.close();
      var guide = $("#pm-guide-link");
      if (guide) {
        guide.setAttribute("href", mode === "pm1" ? "summary/pm1_guide.html" : "summary/pm2_guide.html");
        $("#pm-guide-title").textContent = mode === "pm1"
          ? "午後I 解き方ガイド（時間配分・問い方別の型・採点講評の落とし穴）"
          : "午後II 論文ガイド（ア・イ・ウの型・事業特性・経験がない人の事例設定）";
      }
      renderFilters(mode);
      renderList();
      if (window.PmSchedule) window.PmSchedule.render(mode); // 週ごとの練習スケジュール（js/pm_schedule.js）
      var rv = $("#pm-review");
      if (rv) {
        rv.hidden = mode !== "pm2";
        if (mode === "pm2" && window.PM2Study && window.PM2Study.renderReview) window.PM2Study.renderReview(rv); // 今日の復習（段階学習の×・△）
      }
      if (window.DrillUI) window.DrillUI.onPmModeShown(mode);
    }
  }

  function restoreMode() {
    var saved = "am2";
    try { saved = localStorage.getItem(MODE_KEY) || "am2"; } catch (e) { /* ignore */ }
    if (saved !== "am2" && saved !== "pm1" && saved !== "pm2" && saved !== "terms" && saved !== "textbook") saved = "am2";
    switchMode(saved);
  }

  /* ---------- フィルタ ---------- */
  function renderFilters(mode) {
    var items = itemsForMode(mode);
    var industries = [];
    var themes = [];
    items.forEach(function (it) {
      var tg = it.q.tags || {};
      if (tg.industry && industries.indexOf(tg.industry) < 0) industries.push(tg.industry);
      if (tg.theme && themes.indexOf(tg.theme) < 0) themes.push(tg.theme);
    });
    industries.sort();
    themes.sort();

    var el = $("#pm-filters");
    el.innerHTML =
      '<label class="opt">業種 <select id="pm-f-industry"><option value="all">すべて</option>' +
      industries.map(function (v) { return '<option value="' + escapeAttr(v) + '">' + escapeHtml(v) + '</option>'; }).join("") +
      '</select></label>' +
      '<label class="opt">テーマ <select id="pm-f-theme"><option value="all">すべて</option>' +
      themes.map(function (v) { return '<option value="' + escapeAttr(v) + '">' + escapeHtml(v) + '</option>'; }).join("") +
      '</select></label>' +
      '<label class="opt">状態 <select id="pm-f-status"><option value="all">すべて</option>' +
      '<option value="todo">未着手</option><option value="done">演習済</option><option value="review">要復習</option>' +
      '</select></label>';

    $("#pm-f-industry").value = filters.industry;
    $("#pm-f-theme").value = filters.theme;
    $("#pm-f-status").value = filters.status;

    $("#pm-f-industry").addEventListener("change", function () { filters.industry = this.value; renderList(); });
    $("#pm-f-theme").addEventListener("change", function () { filters.theme = this.value; renderList(); });
    $("#pm-f-status").addEventListener("change", function () { filters.status = this.value; renderList(); });
  }

  /* ---------- 一覧描画 ---------- */
  function renderList() {
    var records = loadRecords();
    var items = itemsForMode(currentMode);

    var filtered = items.filter(function (it) {
      var tg = it.q.tags || {};
      if (filters.industry !== "all" && tg.industry !== filters.industry) return false;
      if (filters.theme !== "all" && tg.theme !== filters.theme) return false;
      if (filters.status !== "all" && statusOf(records, it.key) !== filters.status) return false;
      return true;
    });

    var byExam = {};
    var examOrder = [];
    filtered.forEach(function (it) {
      var id = it.exam.examId;
      if (!byExam[id]) { byExam[id] = []; examOrder.push(id); }
      byExam[id].push(it);
    });
    examOrder.sort(function (a, b) { return a < b ? 1 : -1; }); // 新しい年度が上

    var list = $("#pm-list");
    list.innerHTML = "";

    if (!examOrder.length) {
      var empty = document.createElement("p");
      empty.className = "pm-empty";
      empty.textContent = "条件に一致する問題がありません。";
      list.appendChild(empty);
    }

    // 開いている試験回を端末に記憶（初回は未完了の問題がある最新の試験回だけ開く）
    var openKey = "st_pm_open_" + currentMode, openSet = null;
    try { openSet = JSON.parse(localStorage.getItem(openKey)); } catch (e) { openSet = null; }
    var filtering = filters.industry !== "all" || filters.theme !== "all" || filters.status !== "all";
    if (!openSet) {
      openSet = {};
      for (var oi = 0; oi < examOrder.length; oi++) {
        var undone = byExam[examOrder[oi]].some(function (it) { return statusOf(records, it.key) !== "done"; });
        if (undone) { openSet[examOrder[oi]] = true; break; }
      }
    }

    examOrder.forEach(function (examId) {
      var exam = byExam[examId][0].exam;
      var pm = exam[currentMode];
      var its = byExam[examId];
      var doneN = its.filter(function (it) { return statusOf(records, it.key) === "done"; }).length;
      var card = document.createElement("details");
      card.className = "card pm-exam-card" + (doneN === its.length ? " all-done" : "");
      if (filtering || openSet[examId]) card.open = true;

      var ansLabel = currentMode === "pm1" ? "解答例" : "出題趣旨";
      var head = document.createElement("summary");
      head.className = "pm-exam-head";
      head.innerHTML =
        '<span class="pm-exam-caret" aria-hidden="true"></span>' +
        "<h3>" + escapeHtml(exam.examLabel) + "</h3>" +
        '<span class="pm-exam-dots" aria-hidden="true">' + its.map(function (it) {
          return '<i class="' + statusOf(records, it.key) + '" title="問' + it.q.no + '"></i>';
        }).join("") + "</span>" +
        '<span class="pm-exam-count' + (doneN === its.length ? " ok" : "") + '">済 ' + doneN + " / " + its.length + "</span>";
      card.appendChild(head);
      card.addEventListener("toggle", function () {
        if (filtering) return;
        if (card.open) openSet[examId] = true; else delete openSet[examId];
        try { localStorage.setItem(openKey, JSON.stringify(openSet)); } catch (e) { /* ignore */ }
      });

      var body = document.createElement("div");
      body.className = "pm-exam-body";
      body.innerHTML = '<div class="pm-exam-links">' +
        '<a href="' + escapeAttr(pm.urls.qs) + '" target="_blank" rel="noopener">問題PDF</a>' +
        '<a href="' + escapeAttr(pm.urls.ans) + '" target="_blank" rel="noopener">' + ansLabel + '</a>' +
        '<a href="' + escapeAttr(pm.urls.cmnt) + '" target="_blank" rel="noopener">講評</a>' +
        "</div>";
      its.forEach(function (it) {
        body.appendChild(renderRow(it, records));
      });
      card.appendChild(body);

      list.appendChild(card);
    });

    // すべて開く／閉じる
    var bar = $("#pm-open-bar");
    if (bar) bar.hidden = filtering || !examOrder.length;

    renderProgress();
  }

  // AI採点の結果から「次に向けたポイント」の箇条書きを取り出す（午後I・IIの学習画面と一覧で共用）
  var NEXT_HEAD = /次(回)?に向け|次への|次に(生か|活か)す|今後に向け/;
  function nextPointsFrom(text) {
    var lines = String(text || "").split(/\r?\n/), out = [], i, start = -1;
    for (i = 0; i < lines.length; i++) { if (NEXT_HEAD.test(lines[i])) { start = i; break; } }
    if (start < 0) return out;
    var head = lines[start].replace(/\*\*/g, "");
    var rest = head.split(/[:：]/).slice(1).join("：").trim();
    if (rest) out.push(rest);
    for (i = start + 1; i < lines.length && out.length < 6; i++) {
      var ln = lines[i].trim();
      if (!ln) { if (out.length && !(lines[i + 1] || "").trim()) break; continue; }
      if (/^(判定一覧|評価一覧)/.test(ln.replace(/[*#\s]/g, "")) || /^(#|■|---|___|【)/.test(ln)) break;
      if (out.length && /^\*\*[^*]+\*\*[:：]?$/.test(ln)) break; // 次の太字見出し
      ln = ln.replace(/\*\*/g, "").replace(/^([-・*•●◆]|\d+[.)．、]|[①-⑩])\s*/, "").trim();
      if (ln) out.push(ln.length > 160 ? ln.slice(0, 160) + "…" : ln);
    }
    return out;
  }
  function nextPointsHtml(items, note) {
    if (!items.length) return '<p class="stats-note">AI採点の結果を貼り付けると，「次に向けたポイント」をここに表示します。' + (note || "") + '</p>';
    return '<ol class="pm-next-list">' + items.map(function (t) { return "<li>" + escapeHtml(t) + "</li>"; }).join("") + "</ol>" +
      (note ? '<p class="stats-note">' + note + "</p>" : "");
  }
  window.PmNext = { from: nextPointsFrom, html: nextPointsHtml };

  function renderRow(it, records) {
    var q = it.q;
    var rec = records[it.key];
    var status = (rec && rec.s) ? rec.s : "todo";
    var tg = q.tags || {};

    // pm1/pm2学習画面用データがある問だけ「学習」ボタンを出し、正式タイトルがあれば優先表示する
    var pm2t = (currentMode === "pm2") ? pm2TextFor(it.exam.examId, q.no) : null;
    var pm1t = (currentMode === "pm1") ? pm1TextFor(it.exam.examId, q.no) : null;
    var studyData = pm2t || pm1t;
    var displayTitle = (studyData && studyData.title) ? studyData.title : q.title;

    var row = document.createElement("div");
    row.className = "pm-row" + (status === "done" ? " is-done" : "");

    var main = document.createElement("div");
    main.className = "pm-row-main";
    main.innerHTML =
      '<span class="pm-row-mark ' + status + '" aria-hidden="true">' + (status === "done" ? "✓" : status === "review" ? "!" : "") + "</span>" +
      '<span class="badge pm-no">問' + q.no + "</span>" +
      '<div class="pm-row-body" title="' + escapeAttr(q.desc || "") + '">' +
      '<div class="pm-row-title">' + escapeHtml(displayTitle) + "</div>" +
      '<div class="pm-row-tags">' +
      (tg.industry ? '<span class="pm-tag">' + escapeHtml(tg.industry) + "</span>" : "") +
      (tg.theme ? '<span class="pm-tag">' + escapeHtml(tg.theme) + "</span>" : "") +
      "</div>" +
      // 次に向けたポイントは折りたたんで件数だけ出す（行の高さを揃えて一覧を見やすく保つ）
      (rec && rec.next && rec.next.length ? '<details class="pm-row-next"><summary>次に向けたポイント（' + rec.next.length + '）</summary><ol>' +
        rec.next.map(function (t) { return "<li>" + escapeHtml(t) + "</li>"; }).join("") + "</ol></details>" : "") +
      "</div>" +
      '<div class="pm-row-actions">' +
      '<span class="pm-status ' + status + '">' + STATUS_LABEL[status] + (rec && rec.g ? " " + escapeHtml(rec.g) : "") + (rec && rec.pt != null ? "・" + escapeHtml(String(rec.pt)) + "/50点" : "") + (rec && rec.h ? "・ヒント" : "") + (rec && rec.ai ? "・AI " + escapeHtml(rec.ai) : "") + "</span>" +
      '<span class="pm-row-btns">' +
      (studyData ? '<button type="button" class="linkbtn pm-btn-study">学習</button>' : "") +
      '<button type="button" class="linkbtn pm-btn-record">記録</button>' +
      "</span>" +
      "</div>";
    row.appendChild(main);

    var panel = buildRecordPanel(it, rec);
    panel.hidden = true;
    row.appendChild(panel);

    main.querySelector(".pm-btn-record").addEventListener("click", function () {
      panel.hidden = !panel.hidden;
    });

    var studyBtn = main.querySelector(".pm-btn-study");
    if (studyBtn) {
      studyBtn.addEventListener("click", function () {
        if (pm1t) {
          if (window.PM1Study && window.PM1Study.open) window.PM1Study.open(it.exam.examId, q.no);
        } else {
          if (window.PM2Study && window.PM2Study.open) window.PM2Study.open(it.exam.examId, q.no);
        }
      });
    }

    return row;
  }

  function buildRecordPanel(it, rec) {
    rec = rec || { s: "todo", g: "", m: "", note: "" };
    var panel = document.createElement("div");
    panel.className = "pm-record-panel";
    panel.innerHTML =
      '<label class="opt">状態<select class="pm-in-status">' +
      '<option value="todo">未着手</option><option value="done">演習済</option><option value="review">要復習</option>' +
      "</select></label>" +
      '<label class="opt">自己採点<select class="pm-in-grade">' +
      '<option value="">未評価</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>' +
      "</select></label>" +
      '<label class="opt">所要時間(分)<input type="number" class="pm-in-min" min="0" step="1"></label>' +
      '<label class="opt pm-note-label">メモ<textarea class="pm-in-note" rows="3" placeholder="気づき・弱点など"></textarea></label>' +
      '<div class="pm-panel-actions"><button type="button" class="primary pm-btn-save">保存</button></div>';

    panel.querySelector(".pm-in-status").value = rec.s || "todo";
    panel.querySelector(".pm-in-grade").value = rec.g || "";
    panel.querySelector(".pm-in-min").value = (typeof rec.m === "number") ? rec.m : "";
    panel.querySelector(".pm-in-note").value = rec.note || "";

    panel.querySelector(".pm-btn-save").addEventListener("click", function () {
      var newRec = {
        s: panel.querySelector(".pm-in-status").value,
        g: panel.querySelector(".pm-in-grade").value,
        m: parseInt(panel.querySelector(".pm-in-min").value, 10) || 0,
        note: panel.querySelector(".pm-in-note").value,
        t: Date.now()
      };
      saveRecord(it.key, newRec);
      renderList(); // 状態チップ・進捗表示を最新化（フィルタとの整合も取れる）
    });

    return panel;
  }

  function renderProgress() {
    var records = loadRecords();
    var items = itemsForMode(currentMode);
    var done = items.filter(function (it) { return statusOf(records, it.key) === "done"; }).length;
    $("#pm-progress").textContent = "演習済 " + done + " ／ 全" + items.length + "問";
  }

  /* ---------- 演習タイマー ---------- */
  var timerState = {
    totalSec: 45 * 60,
    remainingSec: 45 * 60,
    endAt: null,
    running: false,
    started: false,
    finished: false,
    intervalId: null
  };

  function fmtClock(sec) {
    if (sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? "0" + m : "" + m) + ":" + (s < 10 ? "0" + s : "" + s);
  }

  function clearTimerInterval() {
    if (timerState.intervalId) { clearInterval(timerState.intervalId); timerState.intervalId = null; }
  }

  function updateTimerDisplay() {
    var disp = $("#pm-timer-display");
    if (!disp) return;
    if (timerState.finished) { disp.textContent = "時間終了"; return; }
    var sec = timerState.running
      ? Math.max(0, Math.round((timerState.endAt - Date.now()) / 1000))
      : timerState.remainingSec;
    disp.textContent = fmtClock(sec);
  }

  function updateTimerButtons() {
    var startBtn = $("#pm-timer-start");
    var toggleBtn = $("#pm-timer-toggle");
    var presetSel = $("#pm-timer-preset");
    if (!startBtn) return;

    var lockedMidRun = timerState.started && !timerState.finished; // 実行中 or 一時停止中
    startBtn.disabled = lockedMidRun;
    presetSel.disabled = lockedMidRun;
    toggleBtn.disabled = !lockedMidRun;
    toggleBtn.textContent = timerState.running ? "一時停止" : "再開";
  }

  function tick() {
    if (!timerState.running) return;
    var remain = Math.round((timerState.endAt - Date.now()) / 1000);
    if (remain <= 0) {
      timerState.running = false;
      timerState.finished = true;
      timerState.remainingSec = 0;
      clearTimerInterval();
      updateTimerButtons();
      updateTimerDisplay();
      return;
    }
    updateTimerDisplay();
  }

  function startTimer() {
    if (timerState.started && !timerState.finished) return;
    timerState.totalSec = parseInt($("#pm-timer-preset").value, 10) * 60;
    timerState.remainingSec = timerState.totalSec;
    timerState.endAt = Date.now() + timerState.remainingSec * 1000;
    timerState.running = true;
    timerState.started = true;
    timerState.finished = false;
    clearTimerInterval();
    timerState.intervalId = setInterval(tick, 250);
    updateTimerButtons();
    updateTimerDisplay();
  }

  function toggleTimer() {
    if (!timerState.started || timerState.finished) return;
    if (timerState.running) {
      timerState.remainingSec = Math.max(0, Math.round((timerState.endAt - Date.now()) / 1000));
      timerState.running = false;
      clearTimerInterval();
    } else {
      if (timerState.remainingSec <= 0) return;
      timerState.endAt = Date.now() + timerState.remainingSec * 1000;
      timerState.running = true;
      clearTimerInterval();
      timerState.intervalId = setInterval(tick, 250);
    }
    updateTimerButtons();
    updateTimerDisplay();
  }

  function resetTimer() {
    clearTimerInterval();
    timerState.running = false;
    timerState.started = false;
    timerState.finished = false;
    timerState.remainingSec = timerState.totalSec;
    updateTimerButtons();
    updateTimerDisplay();
  }

  function renderPmTimerShell() {
    var el = $("#pm-timer");
    el.innerHTML =
      '<select id="pm-timer-preset">' +
      '<option value="45">45分</option>' +
      '<option value="90">90分</option>' +
      '<option value="120">120分</option>' +
      "</select>" +
      '<span id="pm-timer-display" class="pm-timer-display"></span>' +
      '<button type="button" class="primary" id="pm-timer-start">開始</button>' +
      '<button type="button" id="pm-timer-toggle" disabled>一時停止</button>' +
      '<button type="button" id="pm-timer-reset">リセット</button>';

    $("#pm-timer-preset").addEventListener("change", function () {
      if (timerState.started && !timerState.finished) return; // 実行中・一時停止中は変更を無視
      timerState.totalSec = parseInt(this.value, 10) * 60;
      timerState.remainingSec = timerState.totalSec;
      timerState.started = false;
      timerState.finished = false;
      updateTimerButtons();
      updateTimerDisplay();
    });
    $("#pm-timer-start").addEventListener("click", startTimer);
    $("#pm-timer-toggle").addEventListener("click", toggleTimer);
    $("#pm-timer-reset").addEventListener("click", resetTimer);

    updateTimerButtons();
    updateTimerDisplay();
  }

  /* ---------- 午後II学習画面（js/pm2study.js）向け公開API ---------- */
  // 学習画面から一覧へ戻る際に、記録状態の変化（骨子・執筆等はpm2study側の別ストアだが、
  // 念のため）を反映して一覧を再描画するためのフック。
  window.PmUI = {
    refreshList: function () {
      if (currentMode !== "am2") renderList();
      if ((currentMode === "pm1" || currentMode === "pm2") && window.PmSchedule) window.PmSchedule.render(currentMode);
    }
  };

  function setAllOpen(open) {
    var key = "st_pm_open_" + currentMode, set = {};
    Array.prototype.forEach.call(document.querySelectorAll("#pm-list details.pm-exam-card"), function (d) { d.open = open; });
    if (open) itemsForMode(currentMode).forEach(function (it) { set[it.exam.examId] = true; });
    try { localStorage.setItem(key, JSON.stringify(set)); } catch (e) { /* ignore */ }
  }
  if ($("#pm-open-all")) {
    $("#pm-open-all").addEventListener("click", function () { setAllOpen(true); });
    $("#pm-close-all").addEventListener("click", function () { setAllOpen(false); });
  }

  if ($("#pm-para-link")) {
    $("#pm-para-link").addEventListener("click", function (e) {
      e.preventDefault();
      if (window.PmPara) window.PmPara.open();
    });
  }

  /* ---------- 起動 ---------- */
  bindModeTabs();
  renderPmTimerShell();
  restoreMode();

  // クラウド同期の変化（ログイン/ログアウト/他端末での更新）で午後一覧を再描画
  if (window.STSync) {
    window.STSync.setOnChange(function () {
      if (currentMode !== "am2") renderList();
    });
  }
})();
