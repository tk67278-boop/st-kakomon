/* AIの採点結果（Markdown）を画面で読める形に表示する
   - MdLite.render(text): 見出し・表・箇条書き・番号付き・引用・区切り線・太字・コードを HTML にする（先に全体をエスケープする）
   - AiView.attach(textarea): 貼り付け欄の上に整形した表示を置き，結果があるときは貼り付け欄を畳む
   使う所: 初見骨子20分・段落練習・午後IIの振り返り・午後Iの対比・採点 */
(function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/__([^_]+)__/g, "<b>$1</b>");
  }
  // 表のセルが判定の記号だけなら色を付ける
  var MARK = { "◯": "o", "○": "o", "〇": "o", "△": "t", "×": "x", "✕": "x" };
  function cellHtml(c) {
    var t = c.trim(), m = MARK[t.replace(/\*/g, "")];
    return m ? '<span class="md-mark md-mark-' + m + '">' + esc(t.replace(/\*/g, "")) + '</span>' : inline(t);
  }
  function splitRow(l) {
    return l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  }
  var RE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  var RE_LIST = /^(\s*)([-*+・]|\d+[.)．])\s+(.*)$/;
  var RE_HEAD = /^(#{1,6})\s+(.*)$/;
  var RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;

  function render(md) {
    var lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
    var out = [], i = 0;
    function isBlockStart(l, next) {
      return RE_HEAD.test(l) || RE_HR.test(l) || RE_LIST.test(l) || /^\s*>/.test(l) || /^```/.test(l) ||
        (l.indexOf("|") >= 0 && next !== undefined && RE_SEP.test(next));
    }
    while (i < lines.length) {
      var l = lines[i];
      if (!l.trim()) { i++; continue; }
      if (/^```/.test(l)) {
        var code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        i++;
        out.push("<pre>" + esc(code.join("\n")) + "</pre>");
        continue;
      }
      var h = RE_HEAD.exec(l);
      if (h) {
        var lv = Math.min(h[1].length, 4); // # → 見出し1 … #### 以下はまとめる
        out.push('<div class="md-h md-h' + lv + '">' + inline(h[2].replace(/#+\s*$/, "")) + "</div>");
        i++;
        continue;
      }
      if (RE_HR.test(l)) { out.push("<hr>"); i++; continue; }
      if (l.indexOf("|") >= 0 && i + 1 < lines.length && RE_SEP.test(lines[i + 1])) {
        var head = splitRow(l);
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].indexOf("|") >= 0 && lines[i].trim()) rows.push(splitRow(lines[i++]));
        out.push('<div class="md-table"><table><thead><tr>' + head.map(function (c) { return "<th>" + inline(c.trim()) + "</th>"; }).join("") +
          "</tr></thead><tbody>" + rows.map(function (r) {
            return "<tr>" + r.map(function (c) { return "<td>" + cellHtml(c) + "</td>"; }).join("") + "</tr>";
          }).join("") + "</tbody></table></div>");
        continue;
      }
      if (RE_LIST.test(l)) {
        var items = [];
        while (i < lines.length && lines[i].trim()) {
          var m = RE_LIST.exec(lines[i]);
          if (m) items.push({ lv: Math.min(3, Math.floor(m[1].replace(/\t/g, "  ").length / 2)), num: /\d/.test(m[2]) ? m[2] : "", text: m[3] });
          else if (items.length && /^\s+/.test(lines[i])) items[items.length - 1].text += " " + lines[i].trim(); // 続きの行
          else break;
          i++;
        }
        out.push('<ul class="md-list">' + items.map(function (it) {
          return '<li class="md-l' + it.lv + (it.num ? ' md-num" data-n="' + esc(it.num) : '') + '">' + inline(it.text) + "</li>";
        }).join("") + "</ul>");
        continue;
      }
      if (/^\s*>/.test(l)) {
        var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
        out.push('<blockquote>' + q.map(inline).join("<br>") + "</blockquote>");
        continue;
      }
      var p = [];
      while (i < lines.length && lines[i].trim() && !(p.length && isBlockStart(lines[i], lines[i + 1]))) p.push(lines[i++]);
      out.push("<p>" + p.map(inline).join("<br>") + "</p>");
    }
    return out.join("");
  }

  // 貼り付け欄に整形表示を付ける。結果があるときは表示だけを見せ，「貼り直す・編集する」で欄を開く
  function attach(ta) {
    if (!ta || ta.dataset.aiView) return null;
    ta.dataset.aiView = "1";
    var bar = document.createElement("div");
    bar.className = "ai-view-bar";
    bar.innerHTML = '<b>AIの採点結果</b><span class="spacer"></span><button type="button" class="linkbtn ai-view-edit"></button>';
    var view = document.createElement("div");
    view.className = "ai-view";
    ta.parentNode.insertBefore(bar, ta);
    ta.parentNode.insertBefore(view, ta);
    var editBtn = bar.querySelector(".ai-view-edit");
    // 欄の見出し（「〜の貼り付け欄」）は欄と一緒に隠す
    var prev = bar.previousElementSibling;
    var label = prev && prev.tagName === "LABEL" ? prev : null;
    var editing = false;
    function show() {
      var has = !!ta.value.trim();
      bar.style.display = has ? "" : "none";
      view.style.display = has && !editing ? "" : "none";
      ta.style.display = !has || editing ? "" : "none";
      if (label) label.style.display = ta.style.display;
      editBtn.textContent = editing ? "整えた表示に戻す" : "貼り直す・編集する";
      if (has && !editing) view.innerHTML = render(ta.value);
    }
    editBtn.addEventListener("click", function () {
      editing = !editing;
      show();
      if (editing) ta.focus();
    });
    // 貼り付けたらすぐ保存（各画面の change で保存している）して，整えた表示に切り替える
    ta.addEventListener("paste", function () {
      setTimeout(function () { ta.dispatchEvent(new Event("change")); }, 0);
    });
    ta.addEventListener("change", function () { editing = false; show(); });
    show();
    return { refresh: show };
  }

  window.MdLite = { render: render };
  window.AiView = { attach: attach };
})();
