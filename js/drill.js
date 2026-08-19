/* ST 午後II 骨子ドリル（共通編：論述の作法を4択で学ぶミニドリル） */
(function () {
  "use strict";

  var PM_KEY = "st_pm_records_v1"; // pm.jsと同じ保存キー（記録ストアを共有し、キー接頭辞で区別）
  var KANA = ["ア", "イ", "ウ", "エ"];

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  if (!$("#pm-drill")) return; // 想定外のDOM構成の場合は安全に何もしない

  /* ---------- データ ---------- */
  var DRILL = null;
  (window.DRILL_DATA || []).forEach(function (d) { if (d && d.id === "common") DRILL = d; });
  if (!DRILL) DRILL = (window.DRILL_DATA || [])[0] || null;

  if (!DRILL || !DRILL.questions || !DRILL.questions.length) return; // データ未読込

  /* ---------- ユーティリティ ---------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }
  function pct(c, a) { return a === 0 ? 0 : Math.round(c / a * 100); }
  function recKeyFor(no) { return "drill#" + DRILL.id + "#" + no; }
  function findQuestionByNo(no) {
    var found = null;
    DRILL.questions.forEach(function (q) { if (q.no === no) found = q; });
    return found;
  }

  /* ---------- 演習記録 (localStorage / STSync、pm.jsと同じ実装) ---------- */
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
  function recordAnswer(q, correct) {
    var key = recKeyFor(q.no);
    var records = loadRecords();
    var rec = records[key] || { a: 0, c: 0, t: 0 };
    rec.a += 1;
    if (correct) rec.c += 1;
    rec.t = Date.now();
    saveRecord(key, rec);
  }

  function computeStats() {
    var records = loadRecords();
    var total = DRILL.questions.length;
    var attempted = 0, sumA = 0, sumC = 0;
    DRILL.questions.forEach(function (q) {
      var r = records[recKeyFor(q.no)];
      if (r) { attempted++; sumA += r.a || 0; sumC += r.c || 0; }
    });
    return { total: total, attempted: attempted, sumA: sumA, sumC: sumC };
  }

  function mistakeQuestions() {
    var records = loadRecords();
    var list = [];
    DRILL.questions.forEach(function (q) {
      var r = records[recKeyFor(q.no)];
      if (r && r.c < r.a) list.push(q);
    });
    return list;
  }

  /* ---------- 状態 ---------- */
  var currentPmMode = null; // "pm1" | "pm2" | null（pm.jsから見えるモード）
  var viewState = "intro";  // "intro" | "session" | "result"
  var session = null;       // { questions, idx, results, answered }

  /* ---------- 導入カード ---------- */
  function renderIntro() {
    viewState = "intro";
    var stats = computeStats();
    var statusText;
    if (stats.attempted === 0) {
      statusText = "未挑戦";
    } else {
      statusText = "挑戦済み " + stats.attempted + "／" + stats.total + "問・正答率 " + pct(stats.sumC, stats.sumA) + "%";
    }
    var mistakes = mistakeQuestions();

    var html =
      '<div class="card">' +
        '<div class="group-head"><h2>骨子ドリル ' + escapeHtml(DRILL.title) + '</h2></div>' +
        '<p>' + escapeHtml(DRILL.description) + '</p>' +
        '<p class="pool-info">' + escapeHtml(statusText) + '</p>' +
        '<div class="drill-intro-actions">' +
          '<button type="button" class="primary" id="drill-btn-start">ドリルを開始（' + stats.total + '問）</button>' +
          (mistakes.length ? '<button type="button" id="drill-btn-mistakes">間違えた問題だけ（' + mistakes.length + '問）</button>' : '') +
        '</div>' +
      '</div>';

    $("#pm-drill").innerHTML = html;

    $("#drill-btn-start").addEventListener("click", function () {
      startSession(DRILL.questions.slice());
    });
    var mBtn = $("#drill-btn-mistakes");
    if (mBtn) {
      mBtn.addEventListener("click", function () {
        startSession(mistakeQuestions());
      });
    }
  }

  /* ---------- 出題セッション ---------- */
  function startSession(questions) {
    if (!questions || !questions.length) return;
    session = { questions: questions, idx: 0, results: [], answered: false };
    renderQuestionScreen();
  }

  function renderQuestionScreen() {
    viewState = "session";
    var total = session.questions.length;
    var q = session.questions[session.idx];
    var pctDone = Math.round(session.idx / total * 100);

    var html =
      '<div class="quiz-top">' +
        '<div class="q-progress">問 ' + (session.idx + 1) + ' / 全' + total + '</div>' +
      '</div>' +
      '<div class="progressbar"><div style="width:' + pctDone + '%"></div></div>' +
      '<div class="card q-card">' +
        '<div class="q-meta"><span class="badge drill-type">' + escapeHtml(q.type) + '</span></div>' +
        '<div class="q-text">' + escapeHtml(q.question) + '</div>' +
        '<ol class="choices">' +
          q.choices.map(function (c, i) {
            return '<li><button type="button" data-idx="' + i + '"><span class="kana">' + KANA[i] + '</span><span>' + escapeHtml(c) + '</span></button></li>';
          }).join("") +
        '</ol>' +
        '<div class="feedback" id="drill-feedback" hidden>' +
          '<div class="fb-head"><span id="drill-fb-result"></span><span id="drill-fb-answer"></span></div>' +
          '<p id="drill-fb-explanation"></p>' +
        '</div>' +
        '<div class="q-actions"><button type="button" class="primary" id="drill-btn-next" hidden>次の問題へ</button></div>' +
        '<p class="kbd-hint">キー操作: <kbd>1</kbd>〜<kbd>4</kbd> で解答 / <kbd>Enter</kbd> で次へ</p>' +
      '</div>';

    $("#pm-drill").innerHTML = html;

    $$("#pm-drill .choices button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectChoice(parseInt(btn.dataset.idx, 10));
      });
    });
    $("#drill-btn-next").addEventListener("click", goNext);

    if (session.answered) paintAnswered();
  }

  function selectChoice(idx) {
    if (session.answered) return;
    var q = session.questions[session.idx];
    var correct = idx === q.answer;
    session.answered = true;
    session.results.push({ no: q.no, type: q.type, chosen: idx, correct: correct });
    recordAnswer(q, correct);
    paintAnswered();
  }

  function paintAnswered() {
    var q = session.questions[session.idx];
    var result = session.results[session.results.length - 1];

    $$("#pm-drill .choices button").forEach(function (btn) {
      var i = parseInt(btn.dataset.idx, 10);
      btn.disabled = true;
      if (i === q.answer) btn.classList.add("correct");
      else if (i === result.chosen) btn.classList.add("wrong");
      else btn.classList.add("dim");
    });

    var fb = $("#drill-feedback");
    fb.hidden = false;
    fb.classList.remove("good", "bad");
    fb.classList.add(result.correct ? "good" : "bad");
    $("#drill-fb-result").textContent = result.correct ? "正解！" : "不正解";
    $("#drill-fb-answer").textContent = "正解は「" + KANA[q.answer] + "」";
    $("#drill-fb-explanation").textContent = q.explanation || "";

    var nextBtn = $("#drill-btn-next");
    nextBtn.textContent = (session.idx + 1 >= session.questions.length) ? "結果を見る" : "次の問題へ";
    nextBtn.hidden = false;
    nextBtn.focus();
  }

  function goNext() {
    if (!session || !session.answered) return;
    if (session.idx + 1 >= session.questions.length) {
      renderResultScreen();
    } else {
      session.idx += 1;
      session.answered = false;
      renderQuestionScreen();
    }
  }

  /* ---------- 結果画面 ---------- */
  function renderResultScreen() {
    viewState = "result";
    var results = session.results;
    var total = results.length;
    var correct = results.filter(function (r) { return r.correct; }).length;

    var byType = {};
    var typeOrder = [];
    results.forEach(function (r) {
      if (!byType[r.type]) { byType[r.type] = { a: 0, c: 0 }; typeOrder.push(r.type); }
      byType[r.type].a += 1;
      if (r.correct) byType[r.type].c += 1;
    });

    var rows = "<tr><th>種別</th><th>正答率</th><th style='text-align:right'>正解数</th></tr>";
    typeOrder.forEach(function (t) {
      var s = byType[t];
      var p = pct(s.c, s.a);
      rows += "<tr><td>" + escapeHtml(t) + "</td>" +
        "<td><span class='minibar'><i style='width:" + p + "%'></i></span>" + p + "％</td>" +
        "<td class='num'>" + s.c + " / " + s.a + "</td></tr>";
    });

    var wrong = results.filter(function (r) { return !r.correct; });
    var wrongHtml = wrong.map(function (r) {
      return "<li><span class='w-meta'>問" + r.no + "</span>" + escapeHtml(r.type) + "</li>";
    }).join("");

    var html =
      '<div class="card">' +
        '<h2>結果</h2>' +
        '<div class="r-score"><b>' + correct + '</b> ／ ' + total + ' 問正解（正答率 ' + pct(correct, total) + '％）</div>' +
        '<table class="r-cats">' + rows + '</table>' +
        (wrong.length ?
          '<div><h3>間違えた問題</h3><ul class="r-wrong">' + wrongHtml + '</ul></div>' :
          '') +
        '<div class="r-actions">' +
          '<button type="button" class="primary" id="drill-btn-retry-all">もう一度</button>' +
          (wrong.length ? '<button type="button" id="drill-btn-retry-wrong">間違えた問題だけ再挑戦</button>' : '') +
          '<button type="button" id="drill-btn-close">閉じる（導入カードに戻る）</button>' +
        '</div>' +
      '</div>';

    $("#pm-drill").innerHTML = html;

    $("#drill-btn-retry-all").addEventListener("click", function () {
      startSession(DRILL.questions.slice());
    });
    var retryWrongBtn = $("#drill-btn-retry-wrong");
    if (retryWrongBtn) {
      retryWrongBtn.addEventListener("click", function () {
        var wrongQs = wrong.map(function (r) { return findQuestionByNo(r.no); }).filter(function (q) { return !!q; });
        startSession(wrongQs);
      });
    }
    $("#drill-btn-close").addEventListener("click", function () {
      renderIntro();
    });
  }

  /* ---------- 表示フック（js/pm.js の switchMode から呼ばれる） ---------- */
  function renderCurrent() {
    if (session && viewState === "session") renderQuestionScreen();
    else if (session && viewState === "result") renderResultScreen();
    else renderIntro();
  }

  function onPmModeShown(mode) {
    currentPmMode = mode;
    if (mode !== "pm2") {
      $("#pm-drill").innerHTML = ""; // pm1では導入カード等を表示しない
      return;
    }
    renderCurrent();
  }
  window.DrillUI = { onPmModeShown: onPmModeShown };

  /* ---------- キーボード操作（ドリルセッション表示中のみ） ---------- */
  document.addEventListener("keydown", function (e) {
    if (!$("#mode-pm") || $("#mode-pm").hidden) return;
    if (currentPmMode !== "pm2") return;
    if (!session || viewState !== "session") return;
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.key >= "1" && e.key <= "4" && !session.answered) {
      var idx = parseInt(e.key, 10) - 1;
      var btn = $$("#pm-drill .choices button")[idx];
      if (btn) btn.click();
    } else if ((e.key === "Enter" || e.key === " ") && session.answered) {
      e.preventDefault();
      goNext();
    }
  });

  /* ---------- 起動 ---------- */
  // js/pm.js の restoreMode() は本スクリプトの読み込みより先に実行されるため、
  // 保存されていたモードが既に pm1/pm2 だった場合はそちらでは window.DrillUI が
  // 未定義で onPmModeShown が呼ばれない。ここで表示状態を見て初期描画しておく。
  if (!$("#mode-pm").hidden) {
    var activeBtn = document.querySelector(".mode-tab.active");
    onPmModeShown(activeBtn ? activeBtn.dataset.mode : "pm1");
  }
})();
