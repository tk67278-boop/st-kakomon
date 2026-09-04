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

  /* ---------- 読み上げ（Web Speech API・端末内蔵の音声合成を利用） ---------- */
  var TTS = (function () {
    var supported = ("speechSynthesis" in window) && ("SpeechSynthesisUtterance" in window);
    var RATE_KEY = "st_tts_rate_v1";
    var playing = false;
    var chunks = [];   // {text, el} elは読み上げ中ハイライト対象
    var idx = 0;
    var gen = 0;       // 世代トークン。cancel後に古いonendが走っても無視するため
    var rate = 1;
    var voice = null;
    var currentU = null; // Chromeが発話中のutteranceをGCしてonendが来なくなる既知問題への対策で参照を保持

    try {
      var saved = parseFloat(localStorage.getItem(RATE_KEY));
      if (saved >= 0.5 && saved <= 2) rate = saved;
    } catch (e) { /* ignore */ }

    function pickVoice() {
      var vs = window.speechSynthesis.getVoices();
      var ja = [];
      for (var i = 0; i < vs.length; i++) {
        if ((vs[i].lang || "").toLowerCase().indexOf("ja") === 0) ja.push(vs[i]);
      }
      if (!ja.length) { voice = null; return; }
      var pref = null;
      for (var j = 0; j < ja.length; j++) {
        if (/Google|Nanami|Kyoko|Sayaka|Ichiro/i.test(ja[j].name)) { pref = ja[j]; break; }
      }
      voice = pref || ja[0];
    }
    if (supported) {
      pickVoice();
      window.speechSynthesis.onvoiceschanged = pickVoice;
    }

    // 「。」区切りで文に分け、読み上げが途切れにくい長さ（約110字）まで結合する
    // （AndroidのChrome等では長すぎる発話が途中で止まる既知問題があるため）
    function toChunks(text, el) {
      var out = [];
      var buf = "";
      var sent = "";
      for (var i = 0; i < text.length; i++) {
        sent += text.charAt(i);
        if (text.charAt(i) === "。") {
          if (buf && (buf.length + sent.length) > 110) { out.push({ text: buf, el: el }); buf = ""; }
          buf += sent;
          sent = "";
        }
      }
      buf += sent;
      if (buf.replace(/\s/g, "")) out.push({ text: buf, el: el });
      return out;
    }

    // 表示中の本文（段落・箇条書き）と頻出ポイントを読み上げ対象に集める。図は飛ばす
    function collect() {
      chunks = [];
      var body = document.querySelector("#tb-reader .tb-body");
      if (body) {
        for (var i = 0; i < body.children.length; i++) {
          var el = body.children[i];
          if (el.tagName === "P" || el.tagName === "UL") {
            chunks = chunks.concat(toChunks(el.textContent, el));
          }
        }
      }
      var points = document.querySelector("#tb-reader .tb-points-box");
      if (points) {
        var lis = points.querySelectorAll("li");
        var t = "頻出ポイント。";
        for (var k = 0; k < lis.length; k++) t += lis[k].textContent + "。";
        chunks = chunks.concat(toChunks(t, points));
      }
    }

    function setActive(el) {
      var prev = document.querySelector(".tb-tts-active");
      if (prev) prev.classList.remove("tb-tts-active");
      if (el) {
        el.classList.add("tb-tts-active");
        try { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
        catch (e) { /* ignore */ }
      }
    }

    function updateButtons() {
      var play = document.getElementById("tb-tts-play");
      var stopBtn = document.getElementById("tb-tts-stop");
      if (play) play.hidden = playing;
      if (stopBtn) stopBtn.hidden = !playing;
    }

    function speakNext() {
      if (!playing) return;
      if (idx >= chunks.length) { stop(); return; }
      var myGen = gen;
      var c = chunks[idx];
      setActive(c.el);
      var u = new SpeechSynthesisUtterance(c.text);
      u.lang = "ja-JP";
      if (voice) u.voice = voice;
      u.rate = rate;
      u.onend = function () {
        if (playing && myGen === gen) { idx += 1; speakNext(); }
      };
      u.onerror = function () { if (myGen === gen) stop(); };
      currentU = u;
      window.speechSynthesis.speak(u);
    }

    function start() {
      if (!supported) return;
      stop();
      collect();
      if (!chunks.length) return;
      idx = 0;
      gen += 1;
      playing = true;
      updateButtons();
      speakNext();
    }

    function stop() {
      playing = false;
      gen += 1;
      currentU = null;
      if (supported) window.speechSynthesis.cancel();
      setActive(null);
      updateButtons();
    }

    // 再生中に速度を変えた場合は、現在のチャンクから新しい速度で読み直す
    function setRate(r) {
      rate = r;
      try { localStorage.setItem(RATE_KEY, String(r)); } catch (e) { /* ignore */ }
      if (playing) {
        gen += 1;
        window.speechSynthesis.cancel();
        speakNext();
      }
    }

    return {
      supported: supported,
      start: start,
      stop: stop,
      setRate: setRate,
      getRate: function () { return rate; }
    };
  })();

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
    TTS.stop(); // 再描画でDOMが差し替わるため読み上げは止める
    var f = FLAT[currentFlatIndex];
    var ch = f.chapter, sec = f.section;
    var records = loadRecords();
    var done = isDone(records, sec.id);

    var html = '<div class="card tb-reader-card">';
    html += '<div class="tb-reader-head"><button type="button" class="linkbtn" id="tb-btn-back">&larr; 目次へ戻る</button></div>';
    html += '<div class="tb-reader-chapter">第' + ch.order + '章 ' + escapeHtml(ch.title) + '</div>';
    html += '<h2 class="tb-reader-title">' + escapeHtml(sec.title) + '</h2>';
    if (TTS.supported) {
      html += '<div class="tb-tts">' +
        '<button type="button" id="tb-tts-play">▶ 読み上げ</button>' +
        '<button type="button" id="tb-tts-stop" hidden>■ 停止</button>' +
        '<label class="tb-tts-rate">速度<select id="tb-tts-rate">' +
        [0.8, 1, 1.25, 1.5].map(function (r) {
          return '<option value="' + r + '"' + (TTS.getRate() === r ? ' selected' : '') + '>' + r + '×</option>';
        }).join('') +
        '</select></label></div>';
    }
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

    var ttsPlay = $("#tb-tts-play");
    if (ttsPlay) {
      ttsPlay.addEventListener("click", function () { TTS.start(); });
      $("#tb-tts-stop").addEventListener("click", function () { TTS.stop(); });
      $("#tb-tts-rate").addEventListener("change", function (e) {
        TTS.setRate(parseFloat(e.target.value));
      });
    }

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
    TTS.stop();
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

  // 他モードのタブへ切り替えたら読み上げを止める
  findAll(document, ".mode-tab").forEach(function (btn) {
    btn.addEventListener("click", function () { TTS.stop(); });
  });

  /* ---------- 起動 ---------- */
  // js/pm.js の restoreMode() は本スクリプトの読み込みより先に実行されるため、
  // 保存されていたモードが既に textbook だった場合はそちらでは window.TextbookUI が
  // 未定義で onShow が呼ばれない。ここで表示状態を見て初期描画しておく。
  if (!$("#mode-textbook").hidden) onShow();
})();
