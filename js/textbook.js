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
        html += '</ul></div>';
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

  /* ---------- 表示フック（js/pm.js の switchMode から呼ばれる） ---------- */
  function onShow() {
    if ($("#tb-reader").hidden) renderToc();
    else renderReader();
  }
  window.TextbookUI = { onShow: onShow };

  // クラウド同期の変化（他端末での読了状態の更新など）を、教科書モード表示中のみ反映
  if (window.STSync) {
    window.STSync.setOnChange(function () {
      if ($("#mode-textbook").hidden) return;
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
