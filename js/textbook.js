/* ST教科書モード（目次・リーダー表示） */
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  function findAll(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  if (!$("#mode-textbook")) return; // 想定外のDOM構成の場合は安全に何もしない

  /* ---------- データ ---------- */
  // window.TEXTBOOK は tb_ch*.js が push で追加していく（存在する章だけで動く）
  var CHAPTERS = (window.TEXTBOOK || []).slice().sort(function (a, b) { return a.order - b.order; });

  // 章をまたいで連続ナビゲーションするための平坦化リスト
  var FLAT = [];
  CHAPTERS.forEach(function (ch) {
    (ch.sections || []).forEach(function (sec) {
      FLAT.push({ chapter: ch, section: sec });
    });
  });

  /* ---------- ユーティリティ ---------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  // body文字列を段落表示用のHTMLに変換する。
  // ・空行(\n\n以上)区切りのブロックごとに <p>
  // ・ブロック内の全行が「・」始まりなら <ul><li> の箇条書きにする
  // ・"{{図id}}"だけのブロックは、節データの figures 配列（自作の信頼済みSVG）の図に置換し
  //   図番号付きのキャプションを付ける
  // 図以外のテキストは組み立て前に必ずHTMLエスケープする。
  function renderBody(body, figures) {
    var figMap = {};
    (figures || []).forEach(function (f) { figMap[f.id] = f; });
    var figNo = 0;
    var text = String(body || "");
    var blocks = text.split(/\n{2,}/);
    var html = "";
    blocks.forEach(function (block) {
      var trimmed = block.replace(/^\s+|\s+$/g, "");
      if (!trimmed) return;
      var fm = trimmed.match(/^\{\{([\w-]+)\}\}$/);
      if (fm && figMap[fm[1]]) {
        figNo += 1;
        var fig = figMap[fm[1]];
        html += '<figure class="tb-fig">' + fig.html +
          '<figcaption>図' + figNo + '　' + escapeHtml(fig.title || "") + '</figcaption></figure>';
        return;
      }
      var lines = trimmed.split("\n");
      var allBullets = lines.length > 0 && lines.every(function (line) { return /^\s*・/.test(line); });
      if (allBullets) {
        html += "<ul>";
        lines.forEach(function (line) {
          html += "<li>" + escapeHtml(line.replace(/^\s*・\s?/, "")) + "</li>";
        });
        html += "</ul>";
      } else {
        html += "<p>" + escapeHtml(trimmed).replace(/\n/g, "<br>") + "</p>";
      }
    });
    return html;
  }

  /* ---------- 読了状態の保存 ----------
     既存の午後演習記録と同じ保存先 (st_pm_records_v1 / STSync.getPm・setPmRecord) を共有し、
     キーだけ "tb#"+節id で分離する。sync.js / pm.js 自体は変更しない。 */
  var PM_KEY = "st_pm_records_v1";

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
  function tbKey(sectionId) { return "tb#" + sectionId; }
  function isDone(records, sectionId) {
    var r = records[tbKey(sectionId)];
    return !!(r && r.s === "done");
  }
  function toggleDone(sectionId) {
    var records = loadRecords();
    var done = isDone(records, sectionId);
    saveRecord(tbKey(sectionId), { s: done ? "todo" : "done", t: Date.now() });
  }

  /* ---------- 状態 ---------- */
  var currentFlatIndex = -1; // リーダー表示中の節（FLATのindex）。-1なら目次表示中。

  function flatIndexOfSectionId(sectionId) {
    for (var i = 0; i < FLAT.length; i++) {
      if (FLAT[i].section.id === sectionId) return i;
    }
    return -1;
  }

  /* ---------- 目次ビュー ---------- */
  // まとめ資料（js/data/tb_summaries.js）へのリンク。新しいタブで開く
  function summaryLinksHtml(list, cls) {
    return list.map(function (m) {
      return '<a class="' + cls + '" href="' + escapeAttr(m.file) + '" target="_blank" rel="noopener">' +
        '<span class="tb-sum-badge">まとめ資料</span>' +
        '<span class="tb-sum-title">' + escapeHtml(m.title) + '（' + escapeHtml(m.sections[0]) +
          (m.sections.length > 1 ? '〜' + escapeHtml(m.sections[m.sections.length - 1]) : '') + '）</span>' +
        '<span class="tb-sum-go">開く &rarr;</span></a>';
    }).join("");
  }
  function summariesFor(pred) { return (window.TB_SUMMARIES || []).filter(pred); }

  function renderToc() {
    var el = $("#tb-toc");
    if (!el) return;
    var records = loadRecords();
    var doneCount = FLAT.filter(function (f) { return isDone(records, f.section.id); }).length;
    var totalCount = FLAT.length;
    var pct = totalCount === 0 ? 0 : Math.round(doneCount / totalCount * 100);

    var html = '<div class="card tb-progress-card">' +
      '<div class="group-head"><h2>学習進捗</h2><span class="spacer"></span>' +
      '<span class="tb-progress-text">読了 ' + doneCount + ' ／ 全' + totalCount + '節</span></div>' +
      '<div class="progressbar"><div style="width:' + pct + '%"></div></div>' +
      '</div>';

    if (!CHAPTERS.length) {
      html += '<p class="pm-empty">教科書データがまだありません。</p>';
    } else {
      CHAPTERS.forEach(function (ch) {
        html += '<div class="card tb-chapter-card">';
        html += '<h2>第' + ch.order + '章 ' + escapeHtml(ch.title) + '</h2>';
        html += '<ul class="tb-section-list">';
        (ch.sections || []).forEach(function (sec) {
          var done = isDone(records, sec.id);
          html += '<li class="tb-section-row" data-section-id="' + escapeAttr(sec.id) + '">' +
            '<span class="tb-row-no">' + escapeHtml(sec.id) + '</span>' +
            '<span class="tb-row-title">' + escapeHtml(sec.title) + '</span>' +
            '<span class="tb-row-check' + (done ? ' done' : '') + '">' + (done ? '✓' : '') + '</span>' +
            '</li>';
        });
        html += '</ul>';
        var sums = summariesFor(function (m) { return m.chapter === ch.id; });
        if (sums.length) html += '<div class="tb-sum-list">' + summaryLinksHtml(sums, "tb-sum-link") + '</div>';
        html += '</div>';
      });
    }

    el.innerHTML = html;

    findAll(el, ".tb-section-row").forEach(function (row) {
      row.addEventListener("click", function () {
        showReaderBySectionId(row.dataset.sectionId);
      });
    });
  }

  /* ---------- リーダービュー ---------- */

  // 用語チップ選択時: 用語タブへ切替えて検索ボックスに用語名を入れてinputイベントを発火する。
  // terms.js側は変更しない前提のため、既存の #terms-controls 内のinputを探して操作する。
  function goToTermSearch(termName) {
    var tab = document.querySelector('.mode-tab[data-mode="terms"]');
    if (tab) tab.click();
    var input = document.querySelector('#terms-controls input');
    if (!input) return;
    input.value = termName;
    var evt;
    try { evt = new Event("input", { bubbles: true }); }
    catch (e) { evt = document.createEvent("Event"); evt.initEvent("input", true, true); }
    input.dispatchEvent(evt);
  }

  // 確認問題ボタン: 午前IIタブへ切替えて複数問セット演習を起動する。
  function startSectionQuiz(section) {
    var refs = section.refs || [];
    if (!refs.length) return;
    var tab = document.querySelector('.mode-tab[data-mode="am2"]');
    if (tab) tab.click();
    if (window.AM2PracticeSet) window.AM2PracticeSet(refs);
  }

  function renderReader() {
    var el = $("#tb-reader");
    if (!el || currentFlatIndex < 0 || currentFlatIndex >= FLAT.length) return;
    var f = FLAT[currentFlatIndex];
    var ch = f.chapter, sec = f.section;
    var records = loadRecords();
    var done = isDone(records, sec.id);

    var html = '<div class="card tb-reader-card">';
    html += '<div class="tb-reader-head"><button type="button" class="linkbtn" id="tb-btn-back">&larr; 目次へ戻る</button></div>';
    html += '<div class="tb-reader-chapter">第' + ch.order + '章 ' + escapeHtml(ch.title) + '</div>';
    html += '<h2 class="tb-reader-title">' + escapeHtml(sec.title) + '</h2>';
    var secSums = summariesFor(function (m) { return m.sections.indexOf(sec.id) >= 0; });
    if (secSums.length) html += '<div class="tb-sum-list">' + summaryLinksHtml(secSums, "tb-sum-link") + '</div>';
    html += '<div class="tb-body">' + renderBody(sec.body, sec.figures) + '</div>';

    if (sec.points && sec.points.length) {
      html += '<div class="tb-points-box"><h3>頻出ポイント</h3><ul>' +
        sec.points.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join('') +
        '</ul></div>';
    }

    if (sec.terms && sec.terms.length) {
      html += '<div class="tb-terms-wrap"><h3>関連用語</h3><div class="tb-terms-chips">' +
        sec.terms.map(function (t, i) {
          return '<button type="button" class="tb-term-chip" data-term-idx="' + i + '">' + escapeHtml(t) + '</button>';
        }).join('') +
        '</div></div>';
    }

    if (sec.refs && sec.refs.length) {
      html += '<div class="tb-quiz-action"><button type="button" class="primary" id="tb-btn-quiz">この節の確認問題を解く（' + sec.refs.length + '問）</button></div>';
    }

    html += '<div class="tb-done-action"><button type="button" class="tb-btn-done' + (done ? ' done' : '') + '" id="tb-btn-done">' +
      (done ? '読了済み（タップで取消）' : '読了にする') + '</button></div>';

    html += '<div class="tb-nav-row">' +
      '<button type="button" id="tb-btn-prev"' + (currentFlatIndex <= 0 ? ' disabled' : '') + '>&larr; 前の節へ</button>' +
      '<button type="button" id="tb-btn-next"' + (currentFlatIndex >= FLAT.length - 1 ? ' disabled' : '') + '>次の節へ &rarr;</button>' +
      '</div>';
    html += '</div>';

    el.innerHTML = html;

    $("#tb-btn-back").addEventListener("click", backToToc);
    var prevBtn = $("#tb-btn-prev");
    if (prevBtn) prevBtn.addEventListener("click", function () { showReaderByIndex(currentFlatIndex - 1); });
    var nextBtn = $("#tb-btn-next");
    if (nextBtn) nextBtn.addEventListener("click", function () { showReaderByIndex(currentFlatIndex + 1); });
    $("#tb-btn-done").addEventListener("click", function () {
      toggleDone(sec.id);
      renderReader();
    });
    var quizBtn = $("#tb-btn-quiz");
    if (quizBtn) quizBtn.addEventListener("click", function () { startSectionQuiz(sec); });

    findAll(el, ".tb-term-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.dataset.termIdx, 10);
        goToTermSearch(sec.terms[idx]);
      });
    });
  }

  function showReaderByIndex(idx) {
    if (idx < 0 || idx >= FLAT.length) return;
    currentFlatIndex = idx;
    renderReader();
    $("#tb-toc").hidden = true;
    $("#tb-reader").hidden = false;
    window.scrollTo(0, 0);
  }
  function showReaderBySectionId(sectionId) {
    var idx = flatIndexOfSectionId(sectionId);
    if (idx < 0) return;
    showReaderByIndex(idx);
  }
  function backToToc() {
    currentFlatIndex = -1;
    $("#tb-reader").hidden = true;
    $("#tb-toc").hidden = false;
    renderToc(); // 読了状態の変化を目次のチェックマーク・進捗に反映
    window.scrollTo(0, 0);
  }

  /* =====================================================================
     午後II 教科書（summary/pm2_text_*.html を画面内に表示。目次は js/data/pm2_text_toc.js）
     読了の記録は午前IIと同じ "tb#<id>"（id は pm2text-1 など）
     ===================================================================== */
  var PM2_TOC = window.PM2_TEXT_TOC || [];
  var PREF_TB_TAB = "st_tb_tab";
  var currentTab = "am2";
  var pm2Index = -1; // 表示中の章（PM2_TOC の index）。-1なら目次
  var pm2Resize = null;

  function loadTabPref() { try { return localStorage.getItem(PREF_TB_TAB) || "am2"; } catch (e) { return "am2"; } }
  function saveTabPref(v) { try { localStorage.setItem(PREF_TB_TAB, v); } catch (e) { /* ignore */ } }

  function setTab(tab) {
    currentTab = tab === "pm2" ? "pm2" : "am2";
    saveTabPref(currentTab);
    findAll(document, ".tb-tab").forEach(function (b) {
      var on = b.dataset.tbtab === currentTab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("#tb-am2").hidden = currentTab !== "am2";
    $("#tb-pm2").hidden = currentTab !== "pm2";
    if (currentTab === "pm2") { if (pm2Index >= 0) renderPm2Reader(); else renderPm2Toc(); }
    else if ($("#tb-reader").hidden) renderToc();
    else renderReader();
  }

  function renderPm2Toc() {
    stopPm2Resize();
    var el = $("#tb-pm2");
    var records = loadRecords();
    var doneCount = PM2_TOC.filter(function (c) { return isDone(records, c.id); }).length;
    var pct = PM2_TOC.length ? Math.round(doneCount / PM2_TOC.length * 100) : 0;
    var html = '<div class="card tb-progress-card">' +
      '<div class="group-head"><h2>午後II 教科書</h2><span class="spacer"></span>' +
      '<span class="tb-progress-text">読了 ' + doneCount + ' ／ 全' + PM2_TOC.length + '章</span></div>' +
      '<div class="progressbar"><div style="width:' + pct + '%"></div></div>' +
      '<p class="stats-note">設問の読み方から、骨子・段落の組み立て、設問ア・イ・ウの書き方、本番の進め方までを順に学びます。例はすべてA社（事例設定シート）です。</p>' +
      '</div>';
    html += '<div class="card tb-chapter-card"><ul class="tb-section-list">';
    PM2_TOC.forEach(function (c, i) {
      var done = isDone(records, c.id);
      html += '<li class="tb-section-row" data-pm2-index="' + i + '">' +
        '<span class="tb-row-no">' + escapeHtml(c.label) + '</span>' +
        '<span class="tb-row-title">' + escapeHtml(c.title) + (PM2_QUIZ[c.id] ? '<span class="tbq-badge">問題 ' + (PM2_QUIZ[c.id].choice.length + PM2_QUIZ[c.id].write.length) + '</span>' : '') +
          '<small class="tb-row-sub">' + escapeHtml(c.sub) + '</small></span>' +
        '<span class="tb-row-check' + (done ? ' done' : '') + '">' + (done ? '✓' : '') + '</span></li>';
    });
    html += '</ul></div>';
    el.innerHTML = html;
    findAll(el, ".tb-section-row").forEach(function (row) {
      row.addEventListener("click", function () { showPm2(Number(row.dataset.pm2Index)); });
    });
  }

  function showPm2(i) {
    if (i < 0 || i >= PM2_TOC.length) return;
    quiz = null;
    pm2Index = i;
    renderPm2Reader();
    window.scrollTo(0, 0);
  }

  /* ---------- 午後II 教科書の章ごとの問題（js/data/pm2_text_quiz.js） ----------
     記録: "tbq#<章id>#<問題id>"。選択は {c: 1/0}、記入は {g: o/t/x, a: 書いた答え} */
  var PM2_QUIZ = window.PM2_TEXT_QUIZ || {};
  var quiz = null; // { chap, kind: "choice"|"write", list, idx, answered, results }
  function qKey(chap, id) { return "tbq#" + chap + "#" + id; }
  function quizStats(chap) {
    var data = PM2_QUIZ[chap], records = loadRecords();
    var st = { cN: data.choice.length, cOk: 0, cNg: 0, wN: data.write.length, o: 0, t: 0, x: 0 };
    data.choice.forEach(function (q) { var r = records[qKey(chap, q.id)]; if (r) { if (r.c) st.cOk++; else st.cNg++; } });
    data.write.forEach(function (q) { var r = records[qKey(chap, q.id)]; if (r && st.hasOwnProperty(r.g)) st[r.g]++; });
    return st;
  }
  function quizCardHtml(chap) {
    var st = quizStats(chap);
    return '<div class="card tbq-card"><div class="group-head"><h2>この章の問題</h2></div>' +
      '<div class="tbq-stat"><span>選択問題 ' + st.cN + '問：正解 ' + st.cOk + '・不正解 ' + st.cNg + '・未回答 ' + (st.cN - st.cOk - st.cNg) + '</span>' +
      '<span>記入問題 ' + st.wN + '問：◯ ' + st.o + '・△ ' + st.t + '・× ' + st.x + '・未回答 ' + (st.wN - st.o - st.t - st.x) + '</span></div>' +
      '<div class="tbq-btns">' +
        '<button type="button" class="primary" data-q="choice">選択問題を解く</button>' +
        '<button type="button" class="primary" data-q="write">記入問題を解く</button>' +
        '<button type="button" data-q="choice-retry"' + (st.cNg ? '' : ' disabled') + '>不正解の選択問題だけ（' + st.cNg + '）</button>' +
        '<button type="button" data-q="write-retry"' + (st.t + st.x ? '' : ' disabled') + '>×と△の記入問題だけ（' + (st.t + st.x) + '）</button>' +
      '</div></div>';
  }
  function bindQuizCard(el, chap) {
    findAll(el, ".tbq-card [data-q]").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.dataset.q.split("-");
        startQuiz(chap, m[0], m[1] === "retry");
      });
    });
  }
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function startQuiz(chap, kind, retry) {
    var data = PM2_QUIZ[chap], records = loadRecords();
    var list = data[kind].filter(function (q) {
      if (!retry) return true;
      var r = records[qKey(chap, q.id)];
      return kind === "choice" ? (r && !r.c) : (r && (r.g === "t" || r.g === "x"));
    });
    if (!list.length) return;
    quiz = { chap: chap, kind: kind, list: kind === "choice" ? shuffled(list) : list, idx: 0, answered: false, results: [] };
    renderQuiz();
  }
  function quitQuiz() {
    quiz = null;
    stopPm2Resize();
    renderPm2Reader();
    var card = $("#tb-pm2 .tbq-card");
    if (card) card.scrollIntoView();
  }
  function renderQuiz() {
    stopPm2Resize();
    var el = $("#tb-pm2"), q = quiz.list[quiz.idx], data = PM2_QUIZ[quiz.chap];
    if (!q) return renderQuizEnd();
    var head = '<div class="tb-reader-head"><button type="button" class="linkbtn" id="tbq-back">&larr; ' + escapeHtml(data.title) + 'に戻る</button>' +
      '<span class="spacer"></span><span class="tbq-pos">' + (quiz.kind === "choice" ? "選択" : "記入") + ' ' + (quiz.idx + 1) + ' / ' + quiz.list.length + '</span></div>';
    var html = '<div class="card tb-reader-card">' + head + '<div class="tbq-topic">' + escapeHtml(q.topic) + '</div>' +
      '<p class="tbq-q">' + escapeHtml(q.q).replace(/\n/g, "<br>") + '</p>';
    if (quiz.kind === "choice") {
      var order = shuffled(q.choices.map(function (_, i) { return i; }));
      html += '<div class="tbq-choices">' + order.map(function (i) {
        return '<button type="button" class="tbq-choice" data-i="' + i + '">' + escapeHtml(q.choices[i]) + '</button>';
      }).join("") + '</div><div class="tbq-fb" id="tbq-fb" hidden></div>';
    } else {
      var prev = loadRecords()[qKey(quiz.chap, q.id)];
      html += '<textarea class="tbq-ta" id="tbq-ta" rows="4" placeholder="ここに書きます"></textarea>' +
        '<div class="pm-panel-actions"><button type="button" class="primary" id="tbq-check">答え合わせ</button></div>' +
        '<div class="tbq-fb" id="tbq-fb" hidden><b>解答例</b><p class="tbq-model">' + escapeHtml(q.model) + '</p>' +
          '<b>自己採点の観点</b><ul class="tbq-points">' + q.points.map(function (p) { return '<li>' + escapeHtml(p) + '</li>'; }).join("") + '</ul>' +
          (prev && prev.a ? '<div class="tbq-prev"><b>前回の答え' + (prev.g ? '（' + ({ o: "◯", t: "△", x: "×" })[prev.g] + '）' : '') + '</b>' + escapeHtml(prev.a) + '</div>' : '') +
          '<div class="tbq-grade">' +
            '<button type="button" data-g="o">◯ 観点をすべて満たした</button>' +
            '<button type="button" data-g="t">△ 一部を満たした</button>' +
            '<button type="button" data-g="x">× 満たしていない</button></div></div>';
    }
    html += '<div class="pm-panel-actions"><button type="button" class="primary" id="tbq-next" hidden>' + (quiz.idx + 1 >= quiz.list.length ? '結果を見る' : '次の問題へ') + '</button></div></div>';
    el.innerHTML = html;
    $("#tbq-back").addEventListener("click", quitQuiz);
    $("#tbq-next").addEventListener("click", function () { quiz.idx++; renderQuiz(); window.scrollTo(0, 0); });
    if (quiz.kind === "choice") {
      findAll(el, ".tbq-choice").forEach(function (b) {
        b.addEventListener("click", function () {
          if (quiz.answered) return;
          quiz.answered = true;
          var i = Number(b.dataset.i), ok = i === q.answer;
          findAll(el, ".tbq-choice").forEach(function (x) {
            var xi = Number(x.dataset.i);
            x.disabled = true;
            x.classList.add(xi === q.answer ? "correct" : xi === i ? "wrong" : "dim");
          });
          saveRecord(qKey(quiz.chap, q.id), { c: ok ? 1 : 0, t: Date.now() });
          quiz.results.push(ok ? "o" : "x");
          var fb = $("#tbq-fb");
          fb.hidden = false;
          fb.className = "tbq-fb " + (ok ? "good" : "bad");
          fb.innerHTML = '<b>' + (ok ? "正解" : "不正解") + '</b>' + (ok ? '' : '<p class="tbq-model">正解：' + escapeHtml(q.choices[q.answer]) + '</p>') + '<p>' + escapeHtml(q.exp) + '</p>';
          $("#tbq-next").hidden = false;
        });
      });
    } else {
      $("#tbq-check").addEventListener("click", function () { $("#tbq-fb").hidden = false; $("#tbq-check").hidden = true; });
      findAll(el, ".tbq-grade button").forEach(function (b) {
        b.addEventListener("click", function () {
          var g = b.dataset.g;
          findAll(el, ".tbq-grade button").forEach(function (x) { x.classList.toggle("active", x === b); });
          saveRecord(qKey(quiz.chap, q.id), { g: g, a: String($("#tbq-ta").value || "").slice(0, 500), t: Date.now() });
          if (!quiz.answered) quiz.results.push(g); else quiz.results[quiz.results.length - 1] = g;
          quiz.answered = true;
          $("#tbq-next").hidden = false;
        });
      });
    }
    quiz.answered = false;
  }
  function renderQuizEnd() {
    var el = $("#tb-pm2"), data = PM2_QUIZ[quiz.chap], r = quiz.results;
    var cnt = function (v) { return r.filter(function (x) { return x === v; }).length; };
    var sum = quiz.kind === "choice" ? '正解 ' + cnt("o") + ' / ' + r.length + '問' : '◯ ' + cnt("o") + '・△ ' + cnt("t") + '・× ' + cnt("x") + '（' + r.length + '問）';
    var missN = quiz.kind === "choice" ? cnt("x") : cnt("t") + cnt("x");
    el.innerHTML = '<div class="card tb-reader-card"><h2>' + escapeHtml(data.title) + '：' + (quiz.kind === "choice" ? "選択問題" : "記入問題") + 'の結果</h2>' +
      '<p class="tbq-sum">' + sum + '</p>' +
      '<div class="pm-panel-actions">' +
        (missN ? '<button type="button" class="primary" id="tbq-retry">' + (quiz.kind === "choice" ? '不正解' : '×と△') + 'だけもう一度（' + missN + '）</button>' : '') +
        '<button type="button" id="tbq-end">章に戻る</button></div></div>';
    var kind = quiz.kind, chap = quiz.chap;
    if ($("#tbq-retry")) $("#tbq-retry").addEventListener("click", function () { startQuiz(chap, kind, true); });
    $("#tbq-end").addEventListener("click", quitQuiz);
  }

  function renderPm2Reader() {
    stopPm2Resize();
    var el = $("#tb-pm2"), c = PM2_TOC[pm2Index];
    if (!c) { pm2Index = -1; renderPm2Toc(); return; }
    var done = isDone(loadRecords(), c.id);
    var navHtml = function (pos) {
      return '<div class="tb-reader-nav tb-pm2-nav">' +
        '<button type="button" class="tb-pm2-prev"' + (pm2Index <= 0 ? ' disabled' : '') + '>&larr; 前の章へ</button>' +
        (pos === "bottom" ? '<button type="button" class="primary tb-pm2-done">' + (done ? '読了を取り消す' : '読了にする') + '</button>' : '') +
        '<button type="button" class="tb-pm2-next"' + (pm2Index >= PM2_TOC.length - 1 ? ' disabled' : '') + '>次の章へ &rarr;</button></div>';
    };
    // 広い画面では左に章の一覧と「この章の見出し」を置く（本文は読みやすい幅のまま）
    var recs = loadRecords();
    var sideHtml = '<aside class="tb-pm2-side"><div class="card">' +
      '<div class="tb-pm2-side-h">章</div><ol class="tb-pm2-side-list">' +
      PM2_TOC.map(function (x, i) {
        return '<li><button type="button" class="tb-pm2-side-btn tb-pm2-side-ch' + (i === pm2Index ? ' active' : '') + '" data-i="' + i + '">' +
          escapeHtml(x.label + " " + x.title) + (isDone(recs, x.id) ? '<span class="tb-pm2-side-done">読了</span>' : '') + '</button></li>';
      }).join("") + '</ol>' +
      '<div class="tb-pm2-side-h">この章の見出し</div><ol class="tb-pm2-side-list" id="tb-pm2-secs"></ol>' +
      '</div></aside>';
    el.innerHTML = '<div class="tb-pm2-layout">' + sideHtml + '<div class="tb-pm2-main">' +
      '<div class="card tb-reader-card">' +
      '<div class="tb-reader-head"><button type="button" class="linkbtn" id="tb-pm2-back">&larr; 目次へ戻る</button>' +
        '<span class="spacer"></span><a class="linkbtn" href="' + escapeAttr(c.file) + '" target="_blank" rel="noopener">別のタブで開く</a></div>' +
      '<div class="tb-reader-chapter">午後II 教科書 ' + escapeHtml(c.label) + (done ? '<span class="tb-pm2-done-tag">読了</span>' : '') + '</div>' +
      navHtml("top") +
      '<iframe class="tb-pm2-frame" src="' + escapeAttr(c.file) + '" title="' + escapeAttr(c.label + " " + c.title) + '"></iframe>' +
      navHtml("bottom") +
      '</div>' +
      (PM2_QUIZ[c.id] ? quizCardHtml(c.id) : '') +
      '</div></div>';
    findAll(el, ".tb-pm2-side-ch").forEach(function (b) {
      b.addEventListener("click", function () { showPm2(Number(b.dataset.i)); });
    });
    $("#tb-pm2-back").addEventListener("click", function () { pm2Index = -1; renderPm2Toc(); window.scrollTo(0, 0); });
    if (PM2_QUIZ[c.id]) bindQuizCard(el, c.id);
    findAll(el, ".tb-pm2-prev").forEach(function (b) { b.addEventListener("click", function () { showPm2(pm2Index - 1); }); });
    findAll(el, ".tb-pm2-next").forEach(function (b) { b.addEventListener("click", function () { showPm2(pm2Index + 1); }); });
    findAll(el, ".tb-pm2-done").forEach(function (b) {
      b.addEventListener("click", function () { toggleDone(c.id); renderPm2Reader(); });
    });
    // 章のページの高さに合わせて枠の高さを変える（確認問題の答えを開いたときも追従）
    var frame = el.querySelector(".tb-pm2-frame");
    frame.addEventListener("load", function () {
      var doc;
      try { doc = frame.contentDocument; } catch (e) { doc = null; }
      if (!doc) { frame.style.height = "80vh"; return; }
      // 文書全体の高さは枠の高さ以上になるため、縮めるときも追従できるよう本文（body）の高さで合わせる
      var fit = function () { frame.style.height = (doc.body.scrollHeight + 24) + "px"; };
      fit();
      buildPm2Secs(frame, doc);
      // 枠の中の要素は、枠の中の ResizeObserver でないと変化を拾えないため defaultView のものを使う
      var RO = doc.defaultView && doc.defaultView.ResizeObserver;
      if (RO) { pm2Resize = new RO(fit); pm2Resize.observe(doc.body); }
      doc.addEventListener("toggle", fit, true); // 確認問題の答えを開閉したとき
      // 章の中の「次の章」リンクなどで中身が変わった場合も目次と合わせる
      var m = /pm2_text_?([0-9]+|appx)?\.html/.exec(doc.location.pathname);
      if (m && m[1]) {
        var idx = PM2_TOC.findIndex(function (x) { return x.file.indexOf("pm2_text_" + m[1] + ".html") >= 0; });
        if (idx >= 0 && idx !== pm2Index) { pm2Index = idx; renderPm2Reader(); }
      }
    });
  }
  // 左の「この章の見出し」: 章のページの h2 へ移動する（枠は中身の高さに合わせてあるので、ページ全体をスクロールする）
  function buildPm2Secs(frame, doc) {
    var list = $("#tb-pm2-secs");
    if (!list) return;
    var hs = Array.prototype.slice.call(doc.querySelectorAll("h2"));
    var c = PM2_TOC[pm2Index];
    list.innerHTML = hs.map(function (h, i) {
      return '<li><button type="button" class="tb-pm2-side-btn" data-h="' + i + '">' + escapeHtml(h.textContent.trim()) + '</button></li>';
    }).join("") +
      (c && PM2_QUIZ[c.id] ? '<li><button type="button" class="tb-pm2-side-btn" data-quiz="1">この章の問題（アプリで解く）</button></li>' : '');
    findAll(list, "button").forEach(function (b) {
      b.addEventListener("click", function () {
        var target = b.dataset.quiz ? document.querySelector("#tb-pm2 .tbq-card") : null;
        var y = target ? target.getBoundingClientRect().top :
          frame.getBoundingClientRect().top + hs[Number(b.dataset.h)].getBoundingClientRect().top;
        window.scrollTo(0, window.scrollY + y - 8);
      });
    });
  }
  function stopPm2Resize() { if (pm2Resize) { pm2Resize.disconnect(); pm2Resize = null; } }

  findAll(document, ".tb-tab").forEach(function (b) {
    b.addEventListener("click", function () { setTab(b.dataset.tbtab); });
  });

  /* ---------- 表示フック（js/pm.js の switchMode から呼ばれる） ---------- */
  function onShow() {
    setTab(currentTab === "am2" && pm2Index < 0 ? loadTabPref() : currentTab);
  }
  // openPm2: 午後IIトップの「教科書」リンクから、午後IIタブの目次を開く
  window.TextbookUI = { onShow: onShow, openPm2: function () { pm2Index = -1; saveTabPref("pm2"); currentTab = "pm2"; } };

  // クラウド同期の変化（他端末での読了状態の更新など）を、教科書モード表示中のみ反映
  if (window.STSync) {
    window.STSync.setOnChange(function () {
      if ($("#mode-textbook").hidden) return;
      if (currentTab === "pm2") { if (pm2Index < 0) renderPm2Toc(); return; } // 章の表示中は読み込み直さない
      if ($("#tb-reader").hidden) renderToc();
      else renderReader();
    });
  }

  /* ---------- 起動 ---------- */
  // js/pm.js の restoreMode() は本スクリプトの読み込みより先に実行されるため、
  // 保存されていたモードが既に textbook だった場合はそちらでは window.TextbookUI が
  // 未定義で onShow が呼ばれない。ここで表示状態を見て初期描画しておく。
  if (!$("#mode-textbook").hidden) onShow();
})();
