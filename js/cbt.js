/* CBT風の試験画面の補助機能（IPAのCBT方式に近い操作感で練習するためのもの）
   白黒反転・拡大縮小・左右の幅調整・上下比率（スマホ）・電卓・メモ・問題文マーカーを担当する。
   CBT.mount(root) で .cbt 要素に機能を取り付ける（午前IIの模試画面と，午後I・IIの演習画面で共用）。
   出題・解答・採点・保存は各画面（js/app.js, js/pm1study.js, js/pm2study.js）が担当する。 */
(function () {
  "use strict";

  // 表示の好みは端末ごとに保存（保存できない環境でも動作は変わらない）
  function loadPref(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function savePref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function each(scope, sel, fn) { Array.prototype.forEach.call(scope.querySelectorAll(sel), fn); }

  // 電卓とメモの浮動パネル（各画面の .cbt の末尾に差し込む）
  function toolsHtml() {
    return '' +
      '<div class="cbt-float cbt-calc" hidden>' +
        '<div class="cbt-float-head"><span>電卓</span><button type="button" class="cbt-x" aria-label="閉じる">&times;</button></div>' +
        '<div class="calc-disp">0</div>' +
        '<div class="calc-keys">' +
          [["AC", "AC", "ck-fn"], ["C", "C", "ck-fn"], ["%", "%", "ck-fn"], ["/", "÷", "ck-op"],
           ["7"], ["8"], ["9"], ["*", "×", "ck-op"],
           ["4"], ["5"], ["6"], ["-", "−", "ck-op"],
           ["1"], ["2"], ["3"], ["+", "＋", "ck-op"],
           ["0"], ["00"], ["."], ["=", "＝", "ck-eq"],
           ["sqrt", "√", "ck-fn"], ["neg", "±", "ck-fn"], ["bs", "⌫", "ck-fn ck-wide"]]
            .map(function (k) {
              return '<button type="button" data-k="' + k[0] + '"' + (k[2] ? ' class="' + k[2] + '"' : '') + '>' + (k[1] || k[0]) + '</button>';
            }).join("") +
        '</div>' +
      '</div>' +
      '<div class="cbt-float cbt-memo" hidden>' +
        '<div class="cbt-float-head"><span>メモ</span><button type="button" class="cbt-x" aria-label="閉じる">&times;</button></div>' +
        '<div class="memo-tools">' +
          '<label class="memo-trans"><input type="checkbox"> 半透明</label>' +
          '<span class="memo-markers" role="group" aria-label="マーカー">' +
            '<button type="button" class="mk mk-red" data-mk="#fca5a5" title="赤マーカー（選択した文字に引く）"></button>' +
            '<button type="button" class="mk mk-blue" data-mk="#93c5fd" title="青マーカー"></button>' +
            '<button type="button" class="mk mk-yellow" data-mk="#fde047" title="黄マーカー"></button>' +
            '<button type="button" class="mk mk-white" data-mk="" title="マーカーを消す"></button>' +
          '</span>' +
        '</div>' +
        '<div class="memo-search">' +
          '<input type="search" class="memo-q" placeholder="メモ内を検索" aria-label="メモ内を検索">' +
          '<span class="memo-hit">0/0</span>' +
          '<button type="button" class="memo-prev" aria-label="前を検索">&uarr;</button>' +
          '<button type="button" class="memo-next" aria-label="次を検索">&darr;</button>' +
        '</div>' +
        '<div class="memo-body" contenteditable="true" spellcheck="false" aria-label="メモ"></div>' +
        '<div class="memo-foot"><span class="memo-count">0</span> 字（この演習を閉じるまで保持）</div>' +
      '</div>';
  }

  // 問題文マーカーの道具（拡大・縮小の行に置く）
  function markerToolsHtml() {
    return '<span class="cbt-pmarks" role="group" aria-label="問題文マーカー">' +
      '<button type="button" class="mk mk-red" data-pm="r" title="選択した問題文に赤マーカー"></button>' +
      '<button type="button" class="mk mk-blue" data-pm="b" title="青マーカー"></button>' +
      '<button type="button" class="mk mk-yellow" data-pm="y" title="黄マーカー"></button>' +
      '<button type="button" class="mk mk-white" data-pm="x" title="選択した範囲のマーカーを消す"></button>' +
      '<button type="button" class="cbt-pm-clear" data-pm="clear" title="問題文のマーカーをすべて消す">クリア</button>' +
    '</span>';
  }

  function mount(root) {
    if (!root.querySelector(".cbt-calc")) root.insertAdjacentHTML("beforeend", toolsHtml());
    var q = function (sel) { return root.querySelector(sel); };
    var splitKey = "st_cbt_split_" + (root.dataset.cbtKey || "am");

    /* ---------- 白黒反転 ---------- */
    var invert = q(".cbt-invert input");
    function applyInvert(on) { root.classList.toggle("invert", on); if (invert) invert.checked = on; }
    applyInvert(loadPref("st_cbt_invert", "0") === "1");
    if (invert) invert.addEventListener("change", function () { applyInvert(invert.checked); savePref("st_cbt_invert", invert.checked ? "1" : "0"); });

    /* ---------- 拡大・縮小（問題文の文字サイズ） ---------- */
    var zoom = q(".cbt-zoom input[type=range]"), zoomVal = q(".cbt-zoom-val");
    function applyZoom(v) { root.style.setProperty("--cbt-zoom", v / 100); if (zoomVal) zoomVal.textContent = v + "%"; if (zoom) zoom.value = v; }
    applyZoom(Number(loadPref("st_cbt_zoom", "100")) || 100);
    if (zoom) zoom.addEventListener("input", function () { applyZoom(Number(zoom.value)); savePref("st_cbt_zoom", zoom.value); });

    /* ---------- 左右の幅（境界をドラッグ。PCのみ） ---------- */
    var main = q(".cbt-main"), splitter = q(".cbt-splitter");
    function applySplit(pct) { if (main) main.style.setProperty("--cbt-left", pct + "%"); }
    applySplit(Number(loadPref(splitKey, root.dataset.cbtSplit || "70")) || 70);
    if (splitter) splitter.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      splitter.setPointerCapture(e.pointerId);
      var rect = main.getBoundingClientRect();
      function clamp(ev) { return Math.max(30, Math.min(85, Math.round((ev.clientX - rect.left) / rect.width * 100))); }
      function move(ev) { applySplit(clamp(ev)); }
      function up(ev) {
        splitter.removeEventListener("pointermove", move);
        splitter.removeEventListener("pointerup", up);
        savePref(splitKey, String(clamp(ev)));
      }
      splitter.addEventListener("pointermove", move);
      splitter.addEventListener("pointerup", up);
    });

    /* ---------- 上下の比率（スマホ。問題文を広く／半々／解答を広く） ---------- */
    function setRatio(r) {
      if (!main) return;
      main.dataset.ratio = r;
      savePref("st_cbt_ratio", r);
      each(root, ".cbt-ratio-btn", function (b) { b.classList.toggle("active", b.dataset.r === r); });
    }
    if (q(".cbt-ratio-btn")) {
      setRatio(loadPref("st_cbt_ratio", "half"));
      each(root, ".cbt-ratio-btn", function (b) { b.addEventListener("click", function () { setRatio(b.dataset.r); }); });
    }

    /* ---------- 浮動パネル（電卓・メモ）の開閉と移動 ---------- */
    var calcPanel = q(".cbt-calc"), memoPanel = q(".cbt-memo");
    function toggle(panel, force) {
      var show = force == null ? panel.hidden : force;
      panel.hidden = !show;
      if (show && panel === memoPanel) memoPanel.querySelector(".memo-body").focus();
    }
    each(root, "[data-cbt-open]", function (b) {
      b.addEventListener("click", function () { toggle(b.dataset.cbtOpen === "calc" ? calcPanel : memoPanel); });
    });
    each(root, ".cbt-float", function (panel) {
      panel.querySelector(".cbt-x").addEventListener("click", function () { toggle(panel, false); });
      var head = panel.querySelector(".cbt-float-head");
      head.addEventListener("pointerdown", function (e) {
        if (e.target.closest("button")) return;
        e.preventDefault();
        head.setPointerCapture(e.pointerId);
        var r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        function move(ev) {
          var x = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - dx));
          var y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy));
          panel.style.left = x + "px"; panel.style.top = y + "px"; panel.style.right = "auto"; panel.style.bottom = "auto";
        }
        function up() { head.removeEventListener("pointermove", move); head.removeEventListener("pointerup", up); }
        head.addEventListener("pointermove", move);
        head.addEventListener("pointerup", up);
      });
    });

    /* ---------- 電卓（入力順に計算する一般的な電卓） ---------- */
    var calc, disp = calcPanel.querySelector(".calc-disp");
    function calcClear() { calc = { cur: "0", acc: null, op: null, fresh: true }; show(); }
    function fmt(n) {
      if (!isFinite(n)) return "エラー";
      var s = String(Math.round(n * 1e10) / 1e10);
      return s.length > 14 ? n.toPrecision(10) : s;
    }
    function show() { disp.textContent = calc.cur; }
    function apply(a, op, b) {
      if (op === "+") return a + b;
      if (op === "-") return a - b;
      if (op === "*") return a * b;
      if (op === "/") return b === 0 ? NaN : a / b;
      return b;
    }
    function press(k) {
      var v = Number(calc.cur);
      if (/^\d+$/.test(k)) {
        if (calc.fresh || calc.cur === "0" || calc.cur === "エラー") calc.cur = k === "00" ? "0" : k;
        else if (calc.cur.replace(/[-.]/g, "").length < 12) calc.cur += k;
        calc.fresh = false;
      } else if (k === ".") {
        if (calc.fresh || calc.cur === "エラー") { calc.cur = "0."; calc.fresh = false; }
        else if (calc.cur.indexOf(".") < 0) calc.cur += ".";
      } else if (k === "AC") {
        calcClear(); return;
      } else if (k === "C") {
        calc.cur = "0"; calc.fresh = true;
      } else if (k === "bs") {
        if (!calc.fresh) calc.cur = calc.cur.length > 1 ? calc.cur.slice(0, -1) : "0";
      } else if (k === "neg") {
        calc.cur = fmt(-v);
      } else if (k === "sqrt") {
        calc.cur = fmt(v < 0 ? NaN : Math.sqrt(v)); calc.fresh = true;
      } else if (k === "%") {
        // 割合: 加減算中は直前の数に対する百分率（例: 200 + 15 % → 30），それ以外は÷100
        calc.cur = fmt(calc.acc != null && (calc.op === "+" || calc.op === "-") ? calc.acc * v / 100 : v / 100);
        calc.fresh = true;
      } else if (k === "=") {
        if (calc.op != null && calc.acc != null) { calc.cur = fmt(apply(calc.acc, calc.op, v)); calc.acc = null; calc.op = null; }
        calc.fresh = true;
      } else { // 四則演算
        if (calc.op != null && calc.acc != null && !calc.fresh) calc.cur = fmt(apply(calc.acc, calc.op, v));
        calc.acc = Number(calc.cur); calc.op = k; calc.fresh = true;
      }
      show();
    }
    calcClear();
    calcPanel.querySelector(".calc-keys").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) press(b.dataset.k);
    });

    /* ---------- メモ（半透明・マーカー・検索） ---------- */
    var memo = memoPanel.querySelector(".memo-body"), memoQ = memoPanel.querySelector(".memo-q"), memoHit = memoPanel.querySelector(".memo-hit");
    var hits = [], hitIdx = -1;
    memoPanel.querySelector(".memo-trans input").addEventListener("change", function (e) { memoPanel.classList.toggle("trans", e.target.checked); });
    function updateCount() { memoPanel.querySelector(".memo-count").textContent = memo.innerText.replace(/\n/g, "").length; }
    memo.addEventListener("input", function () { updateCount(); hits = []; memoHit.textContent = "0/0"; });
    each(memoPanel, ".mk", function (b) {
      b.addEventListener("mousedown", function (e) { e.preventDefault(); }); // メモ内の選択を外さない
      b.addEventListener("click", function () {
        var sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed || !memo.contains(sel.anchorNode)) return;
        try { document.execCommand("styleWithCSS", false, true); } catch (e) { /* ignore */ }
        document.execCommand("hiliteColor", false, b.dataset.mk || "transparent");
        sel.collapseToEnd();
      });
    });
    memo.addEventListener("paste", function (e) { // 書式を落として文字だけ貼り付ける
      e.preventDefault();
      document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text"));
    });
    function findAll(text) {
      var out = [];
      if (!text) return out;
      var walker = document.createTreeWalker(memo, NodeFilter.SHOW_TEXT, null), node;
      while ((node = walker.nextNode())) {
        var t = node.nodeValue, i = t.indexOf(text);
        while (i >= 0) { out.push({ node: node, start: i }); i = t.indexOf(text, i + text.length); }
      }
      return out;
    }
    function gotoHit(step) {
      var text = memoQ.value;
      if (!hits.length || hits.q !== text) { hits = findAll(text); hits.q = text; hitIdx = step > 0 ? -1 : 0; }
      if (!hits.length) { memoHit.textContent = "0/0"; return; }
      hitIdx = (hitIdx + step + hits.length) % hits.length;
      var h = hits[hitIdx], range = document.createRange();
      range.setStart(h.node, h.start);
      range.setEnd(h.node, h.start + text.length);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      var rect = range.getBoundingClientRect(), box = memo.getBoundingClientRect();
      if (rect.top < box.top || rect.bottom > box.bottom) memo.scrollTop += rect.top - box.top - box.height / 2;
      memoHit.textContent = (hitIdx + 1) + "/" + hits.length;
    }
    memoQ.addEventListener("input", function () { hits = []; gotoHit(1); });
    memoQ.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); gotoHit(e.shiftKey ? -1 : 1); } });
    memoPanel.querySelector(".memo-next").addEventListener("click", function () { gotoHit(1); });
    memoPanel.querySelector(".memo-prev").addEventListener("click", function () { gotoHit(-1); });

    /* ---------- 問題文マーカー（.cbt-markable 内の選択範囲に色を付ける） ---------- */
    var markable = q(".cbt-markable");
    function unwrap(m) {
      var p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    }
    each(root, ".cbt-pmarks button", function (b) {
      b.addEventListener("mousedown", function (e) { e.preventDefault(); }); // 問題文の選択を外さない
      b.addEventListener("click", function () {
        if (!markable) return;
        var kind = b.dataset.pm;
        if (kind === "clear") { each(markable, "mark.pmk", unwrap); return; }
        var sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed) return;
        var range = sel.getRangeAt(0);
        if (!markable.contains(range.commonAncestorContainer)) return;
        // 選択範囲に掛かる既存のマーカーを外してから塗り直す（消しゴムは外すだけ）
        each(markable, "mark.pmk", function (m) { if (range.intersectsNode(m)) unwrap(m); });
        if (kind !== "x") {
          // 段落や図表をまたぐ選択でも，テキストの部分だけを個別に包む
          var walker = document.createTreeWalker(range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer, NodeFilter.SHOW_TEXT, null);
          var nodes = [], n;
          while ((n = walker.nextNode())) if (range.intersectsNode(n) && n.nodeValue.trim()) nodes.push(n);
          nodes.forEach(function (node) {
            var s = node === range.startContainer ? range.startOffset : 0;
            var e = node === range.endContainer ? range.endOffset : node.nodeValue.length;
            if (e <= s) return;
            var r = document.createRange();
            r.setStart(node, s); r.setEnd(node, e);
            var mk = document.createElement("mark");
            mk.className = "pmk pmk-" + kind;
            r.surroundContents(mk);
          });
        }
        sel.removeAllRanges();
      });
    });

    return {
      setRatio: setRatio,
      getRatio: function () { return main ? main.dataset.ratio : ""; },
      // 新しい試験の開始時: メモ・電卓・マーカーを初期化し，パネルを閉じる
      reset: function () {
        memo.innerHTML = ""; updateCount();
        memoQ.value = ""; memoHit.textContent = "0/0"; hits = [];
        calcClear();
        toggle(calcPanel, false); toggle(memoPanel, false);
        if (markable) each(markable, "mark.pmk", unwrap);
      },
      close: function () { toggle(calcPanel, false); toggle(memoPanel, false); }
    };
  }

  window.CBT = { mount: mount, markerToolsHtml: markerToolsHtml };

  // 午前IIの模試画面（index.html の #screen-mock）
  var mockRoot = document.getElementById("screen-mock");
  if (mockRoot && mockRoot.classList.contains("cbt")) {
    var m = mount(mockRoot);
    window.CBT.reset = m.reset;
    window.CBT.close = m.close;
  }
})();
