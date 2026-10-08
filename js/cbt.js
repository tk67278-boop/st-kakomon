/* 模試画面のCBT風の補助機能（IPAのCBT方式に近い操作感で練習するためのもの）
   白黒反転・拡大縮小・左右の幅調整・電卓・メモ（半透明・マーカー・検索）を担当する。
   出題・解答・採点は js/app.js の模試モードが担当し、ここは window.CBT.reset()/close() で連携する。 */
(function () {
  "use strict";
  var root = document.getElementById("screen-mock");
  if (!root || !root.classList.contains("cbt")) return; // 旧index.htmlがキャッシュされている間は何もしない
  var $ = function (id) { return document.getElementById(id); };

  // 表示の好みは端末ごとに保存（保存できない環境でも動作は変わらない）
  function loadPref(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function savePref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  /* ---------- 白黒反転 ---------- */
  var invert = $("cbt-invert");
  function applyInvert(on) { root.classList.toggle("invert", on); invert.checked = on; }
  applyInvert(loadPref("st_cbt_invert", "0") === "1");
  invert.addEventListener("change", function () { applyInvert(invert.checked); savePref("st_cbt_invert", invert.checked ? "1" : "0"); });

  /* ---------- 拡大・縮小（問題文の文字サイズ） ---------- */
  var zoom = $("cbt-zoom");
  function applyZoom(v) { root.style.setProperty("--cbt-zoom", v / 100); $("cbt-zoom-val").textContent = v + "%"; zoom.value = v; }
  applyZoom(Number(loadPref("st_cbt_zoom", "100")) || 100);
  zoom.addEventListener("input", function () { applyZoom(Number(zoom.value)); savePref("st_cbt_zoom", zoom.value); });

  /* ---------- 左右の幅（境界をドラッグ。PCのみ） ---------- */
  var main = $("cbt-main"), splitter = $("cbt-splitter");
  function applySplit(pct) { main.style.setProperty("--cbt-left", pct + "%"); }
  applySplit(Number(loadPref("st_cbt_split", "70")) || 70);
  splitter.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    var rect = main.getBoundingClientRect();
    function move(ev) {
      var pct = Math.round((ev.clientX - rect.left) / rect.width * 100);
      applySplit(Math.max(40, Math.min(85, pct)));
    }
    function up(ev) {
      splitter.removeEventListener("pointermove", move);
      splitter.removeEventListener("pointerup", up);
      var pct = Math.round((ev.clientX - rect.left) / rect.width * 100);
      savePref("st_cbt_split", String(Math.max(40, Math.min(85, pct))));
    }
    splitter.addEventListener("pointermove", move);
    splitter.addEventListener("pointerup", up);
  });

  /* ---------- 浮動パネル（電卓・メモ）の開閉と移動 ---------- */
  function toggle(id, force) {
    var el = $(id);
    var show = force == null ? el.hidden : force;
    el.hidden = !show;
    if (show && id === "cbt-memo") $("memo-body").focus();
  }
  $("cbt-btn-calc").addEventListener("click", function () { toggle("cbt-calc"); });
  $("cbt-btn-memo").addEventListener("click", function () { toggle("cbt-memo"); });
  Array.prototype.forEach.call(root.querySelectorAll("[data-close]"), function (b) {
    b.addEventListener("click", function () { toggle(b.dataset.close, false); });
  });
  Array.prototype.forEach.call(root.querySelectorAll("[data-drag]"), function (head) {
    var panel = $(head.dataset.drag);
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
  var calc = { cur: "0", acc: null, op: null, fresh: true };
  var disp = $("calc-disp");
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
      calc = { cur: "0", acc: null, op: null, fresh: true };
    } else if (k === "C") {
      calc.cur = "0"; calc.fresh = true;
    } else if (k === "bs") {
      if (!calc.fresh) calc.cur = calc.cur.length > 1 ? calc.cur.slice(0, -1) : "0";
    } else if (k === "neg") {
      calc.cur = fmt(-v);
    } else if (k === "sqrt") {
      calc.cur = fmt(v < 0 ? NaN : Math.sqrt(v)); calc.fresh = true;
    } else if (k === "%") {
      // 割合: 直前の数に対する百分率（例: 200 × 15 % → 30）
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
  $("calc-keys").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (b) press(b.dataset.k);
  });

  /* ---------- メモ（半透明・マーカー・検索。内容は試験終了まで保持） ---------- */
  var memo = $("memo-body"), memoPanel = $("cbt-memo");
  $("memo-trans").addEventListener("change", function (e) { memoPanel.classList.toggle("trans", e.target.checked); });
  function updateCount() { $("memo-count").textContent = memo.innerText.replace(/\n/g, "").length; }
  memo.addEventListener("input", function () { updateCount(); hits = []; $("memo-hit").textContent = "0/0"; });
  // マーカー: 選択範囲に背景色を付ける（白は解除）。ボタンを押してもメモ内の選択が外れないようにする
  Array.prototype.forEach.call(root.querySelectorAll(".mk"), function (b) {
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
    b.addEventListener("click", function () {
      var sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed || !memo.contains(sel.anchorNode)) return;
      try { document.execCommand("styleWithCSS", false, true); } catch (e) { /* ignore */ }
      document.execCommand("hiliteColor", false, b.dataset.mk || "transparent");
      sel.collapseToEnd();
    });
  });
  // 貼り付けは書式を落として文字だけにする
  memo.addEventListener("paste", function (e) {
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData("text");
    document.execCommand("insertText", false, text);
  });
  // 検索: 一致箇所を順に選択して表示する
  var hits = [], hitIdx = -1;
  function findAll(q) {
    var out = [];
    if (!q) return out;
    var walker = document.createTreeWalker(memo, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var t = node.nodeValue, i = t.indexOf(q);
      while (i >= 0) { out.push({ node: node, start: i }); i = t.indexOf(q, i + q.length); }
    }
    return out;
  }
  function gotoHit(step) {
    var q = $("memo-q").value;
    if (!hits.length || hits.q !== q) { hits = findAll(q); hits.q = q; hitIdx = step > 0 ? -1 : 0; }
    if (!hits.length) { $("memo-hit").textContent = "0/0"; return; }
    hitIdx = (hitIdx + step + hits.length) % hits.length;
    var h = hits[hitIdx], range = document.createRange();
    range.setStart(h.node, h.start);
    range.setEnd(h.node, h.start + q.length);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var rect = range.getBoundingClientRect(), box = memo.getBoundingClientRect();
    if (rect.top < box.top || rect.bottom > box.bottom) memo.scrollTop += rect.top - box.top - box.height / 2;
    $("memo-hit").textContent = (hitIdx + 1) + "/" + hits.length;
  }
  $("memo-q").addEventListener("input", function () { hits = []; gotoHit(1); });
  $("memo-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); gotoHit(e.shiftKey ? -1 : 1); } });
  $("memo-next").addEventListener("click", function () { gotoHit(1); });
  $("memo-prev").addEventListener("click", function () { gotoHit(-1); });

  /* ---------- 模試モードとの連携 ---------- */
  window.CBT = {
    // 新しい試験の開始時: メモ・電卓を初期化し，パネルを閉じる
    reset: function () {
      memo.innerHTML = ""; updateCount();
      $("memo-q").value = ""; $("memo-hit").textContent = "0/0"; hits = [];
      calc = { cur: "0", acc: null, op: null, fresh: true }; show();
      toggle("cbt-calc", false); toggle("cbt-memo", false);
    },
    close: function () { toggle("cbt-calc", false); toggle("cbt-memo", false); }
  };
})();
