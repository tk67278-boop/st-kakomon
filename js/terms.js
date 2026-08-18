/* ST 用語辞典（用語モード） */
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  function findAll(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  if (!$("#mode-terms")) return; // 想定外のDOM構成の場合は安全に何もしない

  /* ---------- データ ---------- */
  var TERMS = (window.TERM_DATA || []).slice();

  var CATEGORIES = [];
  TERMS.forEach(function (t) {
    if (t.category && CATEGORIES.indexOf(t.category) < 0) CATEGORIES.push(t.category);
  });

  // 出題実績（refs）の年度ラベルは午前IIデータ（QUIZ_DATA）のexamId→examLabelを正とする。
  // 午後I・IIの試験回も同じ年度ラベルを流用できる（試験回の集合が一致しているため）。
  var EXAM_LABELS = {};
  (window.QUIZ_DATA || []).forEach(function (e) { EXAM_LABELS[e.examId] = e.examLabel; });

  /* ---------- 状態 ---------- */
  var state = { query: "", sort: "freq", category: "all" }; // sort: "freq" | "name"
  var openNames = {}; // 詳細を開いている用語名 -> true
  var searchTimer = null;
  var initialized = false;

  /* ---------- ユーティリティ ---------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function importanceMark(n) {
    if (n >= 5) return "★★★";
    if (n >= 2) return "★★";
    if (n >= 1) return "★";
    return "−";
  }

  function refLabel(ref) {
    var examId = ref[0], mode = ref[1], no = ref[2];
    var examLabel = EXAM_LABELS[examId] || examId;
    if (mode === "pm1") return examLabel + " 午後I 問" + no;
    if (mode === "pm2") return examLabel + " 午後II 問" + no;
    return examLabel + " 問" + no; // 現状すべて午前II（表記は省略）
  }

  function matches(t, q) {
    if (!q) return true;
    if (t.name && t.name.toLowerCase().indexOf(q) >= 0) return true;
    if (t.definition && t.definition.toLowerCase().indexOf(q) >= 0) return true;
    var aliases = t.aliases || [];
    for (var i = 0; i < aliases.length; i++) {
      if (aliases[i].toLowerCase().indexOf(q) >= 0) return true;
    }
    return false;
  }

  function filteredSorted() {
    var q = state.query.trim().toLowerCase();
    var list = TERMS.filter(function (t) {
      if (state.category !== "all" && t.category !== state.category) return false;
      return matches(t, q);
    });

    if (state.sort === "name") {
      list.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    } else {
      list.sort(function (a, b) {
        var d = (b.refs ? b.refs.length : 0) - (a.refs ? a.refs.length : 0);
        if (d !== 0) return d;
        return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
      });
    }
    return list;
  }

  /* ---------- 演習への遷移 ---------- */
  function goPractice(examId, no) {
    var tab = document.querySelector('.mode-tab[data-mode="am2"]');
    if (tab) tab.click();
    if (window.AM2Practice) window.AM2Practice(examId, no);
  }

  /* ---------- 描画: コントロール ---------- */
  function renderControls() {
    var el = $("#terms-controls");
    el.innerHTML =
      '<input type="search" id="terms-search" class="terms-search" placeholder="用語を検索">' +
      '<label class="opt">並び順<select id="terms-sort">' +
      '<option value="freq">出題回数順</option>' +
      '<option value="name">名前順</option>' +
      '</select></label>' +
      '<label class="opt">分野<select id="terms-cat">' +
      '<option value="all">すべて</option>' +
      CATEGORIES.map(function (c) { return '<option value="' + escapeAttr(c) + '">' + escapeHtml(c) + '</option>'; }).join("") +
      '</select></label>';

    $("#terms-sort").value = state.sort;
    $("#terms-cat").value = state.category;

    $("#terms-search").addEventListener("input", function () {
      var val = this.value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.query = val;
        renderList();
      }, 150);
    });
    $("#terms-sort").addEventListener("change", function () {
      state.sort = this.value;
      renderList();
    });
    $("#terms-cat").addEventListener("change", function () {
      state.category = this.value;
      renderList();
    });
  }

  /* ---------- 描画: 一覧 ---------- */
  function renderList() {
    var list = filteredSorted();
    var wrap = $("#terms-list");
    wrap.innerHTML = "";

    if (!list.length) {
      var empty = document.createElement("p");
      empty.className = "pm-empty";
      empty.textContent = "条件に一致する用語がありません。";
      wrap.appendChild(empty);
    } else {
      var frag = document.createDocumentFragment();
      list.forEach(function (t) { frag.appendChild(renderRow(t)); });
      wrap.appendChild(frag);
    }

    $("#terms-count").textContent = "絞り込み" + list.length + " ／ 全" + TERMS.length + "語";
  }

  function renderRow(t) {
    var refs = t.refs || [];
    var row = document.createElement("div");
    row.className = "term-row-wrap";

    var main = document.createElement("div");
    main.className = "term-row";
    main.innerHTML =
      '<span class="term-star">' + importanceMark(refs.length) + '</span>' +
      '<span class="term-name">' + escapeHtml(t.name) + '</span>' +
      '<span class="term-count">出題' + refs.length + '回</span>' +
      (t.category ? '<span class="badge cat">' + escapeHtml(t.category) + '</span>' : '');
    row.appendChild(main);

    var detail = buildDetail(t, refs);
    detail.hidden = !openNames[t.name];
    row.appendChild(detail);

    main.addEventListener("click", function () {
      openNames[t.name] = !openNames[t.name];
      detail.hidden = !openNames[t.name];
    });

    return row;
  }

  function buildDetail(t, refs) {
    var panel = document.createElement("div");
    panel.className = "term-detail";

    var html = '<p class="term-def">' + escapeHtml(t.definition || "") + '</p>';

    if (t.aliases && t.aliases.length) {
      html += '<p class="term-aliases">別名: ' + escapeHtml(t.aliases.join(", ")) + '</p>';
    }

    if (refs.length) {
      html += '<p class="term-refs-head">登場した問題（正解・選択肢としての登場を含む）: タップでその場で演習</p>';
      html += '<div class="term-refs">';
      refs.forEach(function (ref, i) {
        var label = escapeHtml(refLabel(ref));
        if (ref[1] === "am2") {
          html += '<button type="button" class="term-ref-btn" data-idx="' + i + '">' + label + '</button>';
        } else {
          html += '<span class="term-ref-label">' + label + '</span>';
        }
      });
      html += '</div>';
    } else {
      html += '<p class="term-refs-empty">出題実績なし（収録範囲内の午前IIでは未出題）</p>';
    }

    panel.innerHTML = html;

    findAll(panel, ".term-ref-btn").forEach(function (btn) {
      var idx = parseInt(btn.dataset.idx, 10);
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        goPractice(refs[idx][0], refs[idx][2]);
      });
    });

    return panel;
  }

  /* ---------- 表示フック（js/pm.js の switchMode から呼ばれる） ---------- */
  function onShow() {
    if (initialized) return;
    initialized = true;
    renderControls();
    renderList();
  }
  window.TermsUI = { onShow: onShow };

  /* ---------- 起動 ---------- */
  // js/pm.js の restoreMode() は本スクリプトの読み込みより先に実行されるため、
  // 保存されていたモードが既に terms だった場合はそちらでは window.TermsUI が
  // 未定義で onShow が呼ばれない。ここで表示状態を見て初期描画しておく。
  if (!$("#mode-terms").hidden) onShow();
})();
