/* ST 午前II 過去問トレーナー */
(function () {
  "use strict";

  var KANA = ["ア", "イ", "ウ", "エ"];
  var STATS_KEY = "st_am2_stats_v1";
  var SETTINGS_KEY = "st_am2_settings_v1";

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* ---------- データ ---------- */
  var EXAMS = (window.QUIZ_DATA || []).slice().sort(function (a, b) {
    return a.examId < b.examId ? -1 : 1;
  });
  // 全問題を平坦化。key = examId#問番号
  var ALL = [];
  EXAMS.forEach(function (exam) {
    exam.questions.forEach(function (q) {
      ALL.push({ exam: exam, q: q, key: exam.examId + "#" + q.no });
    });
  });
  var CATEGORIES = [];
  ALL.forEach(function (item) {
    if (CATEGORIES.indexOf(item.q.category) < 0) CATEGORIES.push(item.q.category);
  });

  /* ---------- 学習履歴 (localStorage) ---------- */
  function syncActive() {
    return !!(window.STSync && window.STSync.active());
  }
  function loadStats() {
    if (syncActive()) return window.STSync.getStats();
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveStats(stats) {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* ignore */ }
  }
  function recordAnswer(key, correct) {
    var stats = loadStats();
    var s = stats[key] || { a: 0, c: 0 };
    s.a += 1;
    if (correct) s.c += 1;
    s.t = Date.now();
    stats[key] = s;
    if (syncActive()) window.STSync.recordAnswer(key, s);
    else saveStats(stats);
  }

  // 午後I・IIの演習記録（js/pm.jsと同じ保存キー）。エクスポート/インポートで一緒に扱うためのみに使用。
  var PM_RECORDS_KEY = "st_pm_records_v1";
  function loadPmRecords() {
    if (syncActive() && window.STSync.getPm) return window.STSync.getPm();
    try { return JSON.parse(localStorage.getItem(PM_RECORDS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function savePmRecordsLocal(records) {
    try { localStorage.setItem(PM_RECORDS_KEY, JSON.stringify(records)); } catch (e) { /* ignore */ }
  }

  /* ---------- ユーティリティ ---------- */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }
  function pct(c, a) { return a === 0 ? 0 : Math.round(c / a * 100); }

  /* ---------- 設定画面 ---------- */
  function renderSetup() {
    var examList = $("#exam-list");
    examList.innerHTML = "";
    EXAMS.forEach(function (exam) {
      var label = document.createElement("label");
      label.innerHTML = '<input type="checkbox" class="ck-exam" value="' + exam.examId + '" checked> ' +
        exam.examLabel + ' <span class="cnt">(' + exam.questions.length + '問)</span>';
      examList.appendChild(label);
    });

    var catList = $("#cat-list");
    catList.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var n = ALL.filter(function (it) { return it.q.category === cat; }).length;
      var label = document.createElement("label");
      label.innerHTML = '<input type="checkbox" class="ck-cat" value="' + cat + '" checked> ' +
        cat + ' <span class="cnt">(' + n + '問)</span>';
      catList.appendChild(label);
    });

    restoreSettings();
    updatePoolInfo();
    renderStatsSummary();
  }

  function selectedExamIds() {
    return $$(".ck-exam").filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
  }
  function selectedCats() {
    return $$(".ck-cat").filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
  }
  function filteredItems() {
    var ex = selectedExamIds(), cats = selectedCats();
    return ALL.filter(function (it) {
      return ex.indexOf(it.exam.examId) >= 0 && cats.indexOf(it.q.category) >= 0;
    });
  }
  function updatePoolInfo() {
    var n = filteredItems().length;
    var countSel = $("#opt-count").value;
    var take = countSel === "all" ? n : Math.min(n, parseInt(countSel, 10));
    $("#pool-info").textContent = "対象 " + n + " 問中 " + take + " 問を出題";
    $("#btn-start").disabled = n === 0;
  }
  function renderStatsSummary() {
    var stats = loadStats();
    var attempts = 0, corrects = 0, seen = 0;
    ALL.forEach(function (it) {
      var s = stats[it.key];
      if (s && s.a > 0) { seen++; attempts += s.a; corrects += s.c; }
    });
    $("#stats-summary").innerHTML =
      '<span><b>' + attempts + '</b>回解答</span>' +
      '<span>正答率 <b>' + pct(corrects, attempts) + '%</b></span>' +
      '<span>挑戦済み <b>' + seen + '</b> / ' + ALL.length + '問</span>';
  }

  function saveSettings() {
    var settings = {
      exams: selectedExamIds(),
      cats: selectedCats(),
      count: $("#opt-count").value,
      order: (document.querySelector('input[name="opt-order"]:checked') || {}).value || "random",
      shuffleChoices: $("#opt-shuffle-choices").checked,
      weakFirst: $("#opt-weak-first").checked
    };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
    return settings;
  }
  function restoreSettings() {
    var s;
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (e) { s = null; }
    if (!s) return;
    $$(".ck-exam").forEach(function (c) { c.checked = !s.exams || s.exams.indexOf(c.value) >= 0; });
    $$(".ck-cat").forEach(function (c) { c.checked = !s.cats || s.cats.indexOf(c.value) >= 0; });
    if (s.count) $("#opt-count").value = s.count;
    $$('input[name="opt-order"]').forEach(function (r) { r.checked = r.value === (s.order || "random"); });
    $("#opt-shuffle-choices").checked = !!s.shuffleChoices;
    $("#opt-weak-first").checked = !!s.weakFirst;
  }

  /* ---------- 出題セッション ---------- */
  var session = null;

  function buildPool(settings) {
    var items = filteredItems();
    var stats = loadStats();

    if (settings.weakFirst) {
      // 未挑戦(-1) → 正答率が低い順。同率はランダム。
      items.forEach(function (it) {
        var s = stats[it.key];
        it._acc = (s && s.a > 0) ? s.c / s.a : -1;
        it._rnd = Math.random();
      });
      items.sort(function (a, b) { return a._acc - b._acc || a._rnd - b._rnd; });
    } else if (settings.order === "random") {
      shuffle(items);
    } else {
      items.sort(function (a, b) {
        return a.exam.examId === b.exam.examId
          ? a.q.no - b.q.no
          : (a.exam.examId < b.exam.examId ? -1 : 1);
      });
    }

    var take = settings.count === "all" ? items.length : Math.min(items.length, parseInt(settings.count, 10));
    var pool = items.slice(0, take);
    if (settings.weakFirst && settings.order === "random") shuffle(pool);
    return pool;
  }

  function startSession(pool, settings) {
    session = {
      pool: pool,
      settings: settings,
      idx: 0,
      results: [],   // {item, chosen(orig index), correct}
      answered: false
    };
    showScreen("quiz");
    renderQuestion();
  }

  function currentItem() { return session.pool[session.idx]; }

  function renderQuestion() {
    var item = currentItem();
    var q = item.q;
    session.answered = false;

    $("#q-progress").textContent = "問 " + (session.idx + 1) + " / " + session.pool.length;
    var correctSoFar = session.results.filter(function (r) { return r.correct; }).length;
    $("#q-score").textContent = "ここまで " + correctSoFar + " 問正解";
    $("#q-bar").style.width = (session.idx / session.pool.length * 100) + "%";

    $("#q-exam").textContent = item.exam.examLabel + " 問" + q.no;
    $("#q-cat").textContent = q.category;

    var s = loadStats()[item.key];
    $("#q-history").textContent = (s && s.a > 0)
      ? "これまで " + s.a + " 回中 " + s.c + " 回正解"
      : "初挑戦";

    $("#q-text").textContent = q.question;
    $("#q-extra").innerHTML = q.html || "";
    if (q.image) {
      $("#q-image").src = q.image;
      $("#q-image-wrap").hidden = false;
    } else {
      $("#q-image").removeAttribute("src");
      $("#q-image-wrap").hidden = true;
    }

    // 選択肢の表示順
    var order = [0, 1, 2, 3];
    if (session.settings.shuffleChoices) shuffle(order);
    session.choiceOrder = order;

    var ol = $("#q-choices");
    ol.innerHTML = "";
    order.forEach(function (origIdx, dispIdx) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.orig = origIdx;
      btn.innerHTML = '<span class="kana">' + KANA[dispIdx] + '</span><span>' + escapeHtml(q.choices[origIdx]) + '</span>';
      btn.addEventListener("click", function () { answer(origIdx); });
      li.appendChild(btn);
      ol.appendChild(li);
    });

    var fb = $("#q-feedback");
    fb.hidden = true;
    fb.classList.remove("good", "bad");
    $("#btn-next").hidden = true;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function answer(origIdx) {
    if (session.answered) return;
    session.answered = true;

    var item = currentItem();
    var q = item.q;
    var correct = origIdx === q.answer;

    session.results.push({ item: item, chosen: origIdx, correct: correct });
    recordAnswer(item.key, correct);

    var buttons = $$("#q-choices button");
    buttons.forEach(function (btn) {
      var o = parseInt(btn.dataset.orig, 10);
      btn.disabled = true;
      if (o === q.answer) btn.classList.add("correct");
      else if (o === origIdx) btn.classList.add("wrong");
      else btn.classList.add("dim");
    });

    var dispKanaOfCorrect = KANA[session.choiceOrder.indexOf(q.answer)];
    var fb = $("#q-feedback");
    fb.hidden = false;
    fb.classList.add(correct ? "good" : "bad");
    var res = $("#fb-result");
    res.textContent = correct ? "正解！" : "不正解";
    res.className = correct ? "good" : "bad";
    $("#fb-answer").textContent = "正解は「" + dispKanaOfCorrect + "」";
    $("#fb-explanation").textContent = q.explanation || "";
    $("#fb-src").textContent = "出典: " + item.exam.examLabel + " ITストラテジスト試験 午前II 問" + q.no;

    var nextBtn = $("#btn-next");
    nextBtn.textContent = session.idx + 1 >= session.pool.length ? "結果を見る" : "次の問題へ";
    nextBtn.hidden = false;
    nextBtn.focus();
  }

  function next() {
    if (!session.answered) return;
    if (session.idx + 1 >= session.pool.length) {
      renderResult();
      showScreen("result");
    } else {
      session.idx += 1;
      renderQuestion();
      window.scrollTo(0, 0);
    }
  }

  /* ---------- 結果画面 ---------- */
  function renderResult() {
    var results = session.results;
    var total = results.length;
    var correct = results.filter(function (r) { return r.correct; }).length;

    $("#r-score").innerHTML =
      "<b>" + correct + "</b> ／ " + total + " 問正解（正答率 " + pct(correct, total) + "％）";

    // 分野別
    var byCat = {};
    results.forEach(function (r) {
      var c = r.item.q.category;
      byCat[c] = byCat[c] || { a: 0, c: 0 };
      byCat[c].a += 1;
      if (r.correct) byCat[c].c += 1;
    });
    var rows = "<tr><th>分野</th><th>正答率</th><th style='text-align:right'>正解数</th></tr>";
    Object.keys(byCat).forEach(function (cat) {
      var s = byCat[cat];
      var p = pct(s.c, s.a);
      rows += "<tr><td>" + cat + "</td>" +
        "<td><span class='minibar'><i style='width:" + p + "%'></i></span>" + p + "％</td>" +
        "<td class='num'>" + s.c + " / " + s.a + "</td></tr>";
    });
    $("#r-cats").innerHTML = rows;

    // 間違えた問題
    var wrong = results.filter(function (r) { return !r.correct; });
    $("#r-wrong-wrap").style.display = wrong.length ? "" : "none";
    var ul = $("#r-wrong");
    ul.innerHTML = "";
    wrong.forEach(function (r) {
      var li = document.createElement("li");
      var snippet = r.item.q.question.split("\n")[0];
      if (snippet.length > 60) snippet = snippet.slice(0, 60) + "…";
      li.innerHTML = "<span class='w-meta'>" + r.item.exam.examLabel + " 問" + r.item.q.no + "</span>" + escapeHtml(snippet);
      ul.appendChild(li);
    });

    renderStatsSummary();
  }

  /* ---------- 画面切替 ---------- */
  function showScreen(name) {
    $("#screen-setup").hidden = name !== "setup";
    $("#screen-quiz").hidden = name !== "quiz";
    $("#screen-result").hidden = name !== "result";
    window.scrollTo(0, 0);
  }

  /* ---------- イベント ---------- */
  function bind() {
    $("#btn-exams-all").addEventListener("click", function () { $$(".ck-exam").forEach(function (c) { c.checked = true; }); updatePoolInfo(); });
    $("#btn-exams-none").addEventListener("click", function () { $$(".ck-exam").forEach(function (c) { c.checked = false; }); updatePoolInfo(); });
    function selectRecent(n) {
      var ids = EXAMS.map(function (e) { return e.examId; }).slice(-n);
      $$(".ck-exam").forEach(function (c) { c.checked = ids.indexOf(c.value) >= 0; });
      updatePoolInfo();
    }
    $("#btn-exams-recent5").addEventListener("click", function () { selectRecent(5); });
    $("#btn-exams-recent10").addEventListener("click", function () { selectRecent(10); });
    $("#btn-cats-all").addEventListener("click", function () { $$(".ck-cat").forEach(function (c) { c.checked = true; }); updatePoolInfo(); });
    $("#btn-cats-none").addEventListener("click", function () { $$(".ck-cat").forEach(function (c) { c.checked = false; }); updatePoolInfo(); });

    document.addEventListener("change", function (e) {
      if (e.target.closest && (e.target.closest("#screen-setup"))) updatePoolInfo();
    });

    $("#btn-start").addEventListener("click", function () {
      var settings = saveSettings();
      var pool = buildPool(settings);
      if (!pool.length) return;
      startSession(pool, settings);
    });

    $("#btn-next").addEventListener("click", next);
    $("#btn-quit").addEventListener("click", function () {
      if (!session || session.results.length === 0) { showScreen("setup"); return; }
      renderResult();
      showScreen("result");
    });

    $("#btn-again").addEventListener("click", function () {
      var pool = buildPool(session.settings);
      startSession(pool, session.settings);
    });
    $("#btn-retry-wrong").addEventListener("click", function () {
      var wrongItems = session.results.filter(function (r) { return !r.correct; }).map(function (r) { return r.item; });
      if (!wrongItems.length) return;
      startSession(shuffle(wrongItems.slice()), session.settings);
    });
    $("#btn-back").addEventListener("click", function () {
      renderStatsSummary();
      updatePoolInfo();
      showScreen("setup");
    });

    $("#btn-reset-stats").addEventListener("click", function () {
      if (confirm("学習履歴（解答回数・正答率）をすべて削除します。よろしいですか？")) {
        if (syncActive()) window.STSync.resetAll();
        else { try { localStorage.removeItem(STATS_KEY); } catch (e) { /* ignore */ } }
        renderStatsSummary();
      }
    });

    // 履歴のエクスポート（JSONファイルとして保存）
    $("#btn-export-stats").addEventListener("click", function () {
      var payload = {
        app: "st-am2-trainer",
        version: 1,
        exportedAt: new Date().toISOString(),
        stats: loadStats(),
        pm: loadPmRecords()
      };
      var blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      var d = new Date();
      a.download = "st-quiz-history_" + d.getFullYear() +
        ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) + ".json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });

    // 履歴のインポート（既存履歴と合算マージ）
    $("#btn-import-stats").addEventListener("click", function () { $("#import-file").click(); });
    $("#import-file").addEventListener("change", function () {
      var file = this.files[0];
      this.value = "";
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var payload = JSON.parse(reader.result);
          var incoming = payload && payload.app === "st-am2-trainer" ? payload.stats : null;
          if (!incoming || typeof incoming !== "object") throw new Error("format");
          var merged = 0;
          if (syncActive()) {
            merged = window.STSync.mergeIn(incoming);
          } else {
            var stats = loadStats();
            Object.keys(incoming).forEach(function (key) {
              var inc = incoming[key];
              if (!inc || typeof inc.a !== "number" || typeof inc.c !== "number") return;
              var cur = stats[key] || { a: 0, c: 0, t: 0 };
              stats[key] = {
                a: cur.a + inc.a,
                c: Math.min(cur.c + inc.c, cur.a + inc.a),
                t: Math.max(cur.t || 0, inc.t || 0)
              };
              merged++;
            });
            saveStats(stats);
          }

          var incomingPm = payload && payload.pm && typeof payload.pm === "object" ? payload.pm : null;
          if (incomingPm) {
            if (syncActive() && window.STSync.mergePmIn) {
              window.STSync.mergePmIn(incomingPm);
            } else {
              var pmRecords = loadPmRecords();
              Object.keys(incomingPm).forEach(function (key) {
                var incRec = incomingPm[key];
                if (!incRec) return;
                var curRec = pmRecords[key];
                if (!curRec || (incRec.t || 0) >= (curRec.t || 0)) pmRecords[key] = incRec;
              });
              savePmRecordsLocal(pmRecords);
            }
          }

          renderStatsSummary();
          alert(merged + "問分の履歴を取り込み、この端末の履歴と合算しました。");
        } catch (e) {
          alert("インポートに失敗しました。このアプリでエクスポートしたJSONファイルを選択してください。");
        }
      };
      reader.readAsText(file);
    });

    document.addEventListener("keydown", function (e) {
      if ($("#screen-quiz").hidden) return;
      if (e.key >= "1" && e.key <= "4" && !session.answered) {
        var dispIdx = parseInt(e.key, 10) - 1;
        var btn = $$("#q-choices button")[dispIdx];
        if (btn) btn.click();
      } else if ((e.key === "Enter" || e.key === " ") && session.answered) {
        e.preventDefault();
        next();
      }
    });
  }

  // 用語モード等から特定の1問だけを演習するためのフック
  window.AM2Practice = function (examId, no) {
    var item = null;
    ALL.forEach(function (it) { if (it.exam.examId === examId && it.q.no === no) item = it; });
    if (!item) return;
    startSession([item], { count: "all", order: "ordered", shuffleChoices: false, weakFirst: false });
  };

  /* ---------- 起動 ---------- */
  renderSetup();
  bind();
  showScreen("setup");

  // クラウド同期の状態変化（ログイン/ログアウト/他端末の更新）でサマリを更新
  if (window.STSync) {
    window.STSync.setOnChange(function () {
      if (!$("#screen-setup").hidden) renderStatsSummary();
    });
  }
})();
