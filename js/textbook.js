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
        '<span class="tb-row-title">' + escapeHtml(c.title) + '<small class="tb-row-sub">' + escapeHtml(c.sub) + '</small></span>' +
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
    pm2Index = i;
    renderPm2Reader();
    window.scrollTo(0, 0);
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
    el.innerHTML = '<div class="card tb-reader-card">' +
      '<div class="tb-reader-head"><button type="button" class="linkbtn" id="tb-pm2-back">&larr; 目次へ戻る</button>' +
        '<span class="spacer"></span><a class="linkbtn" href="' + escapeAttr(c.file) + '" target="_blank" rel="noopener">別のタブで開く</a></div>' +
      '<div class="tb-reader-chapter">午後II 教科書 ' + escapeHtml(c.label) + (done ? '<span class="tb-pm2-done-tag">読了</span>' : '') + '</div>' +
      navHtml("top") +
      '<iframe class="tb-pm2-frame" src="' + escapeAttr(c.file) + '" title="' + escapeAttr(c.label + " " + c.title) + '"></iframe>' +
      navHtml("bottom") +
      '</div>';
    $("#tb-pm2-back").addEventListener("click", function () { pm2Index = -1; renderPm2Toc(); window.scrollTo(0, 0); });
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
