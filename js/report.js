/* ST 午前II 学習レポート（達成度レポート・試験回別レポート） */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  if (!$("#report-modal") || !window.AM2Data) return;

  var D = window.AM2Data;
  var SIM = window.SIMILAR_QUESTIONS || {};

  /* ---------- 状態の判定 ---------- */
  // 直近2回の正誤で色分けする。履歴(h)が無い古い記録は a/c/w から推定する。
  function historyOf(s) {
    if (!s || !s.a) return "";
    if (typeof s.h === "string" && s.h) return s.h;
    var last = (typeof s.w === "number") ? (s.w ? "0" : "1") : (s.c === s.a ? "1" : "0");
    if (s.a === 1) return last;
    var prev = s.c === s.a ? "1" : (s.c === 0 ? "0" : "");
    return prev + last;
  }
  function statusOf(s) {
    var h = historyOf(s);
    if (!h) return "none";
    var last = h.charAt(h.length - 1);
    var prev = h.length >= 2 ? h.charAt(h.length - 2) : "";
    if (last === "1") return prev === "1" ? "gold" : "silver";
    return prev === "0" ? "bad" : "warn";
  }
  var STATUS = {
    gold: { mark: "◎", label: "直近2回とも正解" },
    silver: { mark: "○", label: "直近1回が正解" },
    warn: { mark: "△", label: "直近1回が不正解" },
    bad: { mark: "×", label: "直近2回とも不正解" },
    none: { mark: "", label: "未解答" }
  };
  var STATUS_ORDER = ["bad", "warn", "silver", "gold", "none"];

  // 一覧に表示する○×の並びを作る。{ok:正解か, approx:順序が記録されていない分か}
  // 履歴(h)の記録を始める前の解答は正解数しか残っていないため、
  // 件数だけを薄い○×で補い、順序が不明であることが分かるようにする。
  function historyMarks(s) {
    if (!s || !s.a) return [];
    var known = (typeof s.h === "string" ? s.h : "");
    // 履歴が無い古い記録でも、直近の正誤(w)だけは分かる
    if (!known && typeof s.w === "number") known = s.w ? "0" : "1";
    var marks = known.split("").map(function (c) { return { ok: c === "1", approx: false }; });
    var knownOk = known.split("").filter(function (c) { return c === "1"; }).length;
    var oldTotal = Math.max(0, s.a - known.length);
    if (oldTotal) {
      var oldOk = Math.min(oldTotal, Math.max(0, s.c - knownOk));
      var pre = [];
      for (var i = 0; i < oldOk; i++) pre.push({ ok: true, approx: true });
      for (var j = 0; j < oldTotal - oldOk; j++) pre.push({ ok: false, approx: true });
      marks = pre.concat(marks);
    }
    return marks.slice(-24);
  }
  function marksHtml(s) {
    var marks = historyMarks(s);
    if (!marks.length) return '<span class="rep-dot none">未解答</span>';
    return marks.map(function (m) {
      return '<span class="rep-dot ' + (m.ok ? "o" : "x") + (m.approx ? " approx" : "") + '"' +
        (m.approx ? ' title="履歴の記録を始める前の解答です（正誤の件数のみ判明、順序は不明）"' : "") +
        ">" + (m.ok ? "○" : "×") + "</span>";
    }).join("");
  }
  function hasApprox(s) {
    return historyMarks(s).filter(function (m) { return m.approx; }).length > 0;
  }

  /* ---------- ユーティリティ ---------- */
  function examsOrdered() {
    var all = D.exams();
    var real = all.filter(function (e) { return !e.mock; }).slice().reverse();
    var mock = all.filter(function (e) { return e.mock; });
    return real.concat(mock);
  }
  function shortLabel(examId) {
    var e = D.exams().filter(function (x) { return x.examId === examId; })[0];
    if (!e) return examId;
    if (e.mock) return e.examLabel.replace(/模擬試験([AB]).*/, "模試$1");
    return e.examLabel
      .replace("平成", "平").replace("令和", "令").replace("元年度", "1")
      .replace("年度", "").replace(/\s*春期/, "春").replace(/\s*秋期/, "秋");
  }
  function pct(c, a) { return a === 0 ? 0 : Math.round(c / a * 1000) / 10; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------- 達成度レポート（マトリクス） ---------- */
  function renderGrid() {
    var stats = D.loadStats();
    var exams = examsOrdered();
    var maxNo = 0;
    D.all().forEach(function (it) { if (it.q.no > maxNo) maxNo = it.q.no; });

    var counts = { gold: 0, silver: 0, warn: 0, bad: 0, none: 0 };
    var total = D.all().length, answered = 0;

    var head = '<tr><th class="rep-rowhead"></th>';
    for (var n = 1; n <= maxNo; n++) head += "<th>" + n + "</th>";
    head += "</tr>";

    var rows = "";
    exams.forEach(function (e) {
      rows += '<tr><th class="rep-rowhead">' + esc(e.examLabel) + "</th>";
      for (var no = 1; no <= maxNo; no++) {
        var has = e.questions.filter(function (x) { return x.no === no; }).length > 0;
        if (!has) { rows += '<td class="rep-na"></td>'; continue; }
        var st = statusOf(stats[e.examId + "#" + no]);
        counts[st] += 1;
        if (st !== "none") answered += 1;
        rows += '<td><button type="button" class="rep-cell ' + st + '" data-exam="' + e.examId +
          '" data-no="' + no + '" title="' + esc(e.examLabel) + " 問" + no + "：" + STATUS[st].label +
          '">' + STATUS[st].mark + "</button></td>";
      }
      rows += "</tr>";
    });

    var legend = STATUS_ORDER.map(function (k) {
      var n = counts[k];
      var btn = (k === "none" || n === 0) ? "" :
        '<button type="button" class="rep-legend-go" data-status="' + k + '">この' + n + "問を復習</button>";
      return '<div class="rep-legend-item"><span class="rep-cell ' + k + ' sample">' + STATUS[k].mark +
        '</span><span class="rep-legend-label">' + STATUS[k].label + "</span>" +
        "<b>" + n + "問</b>" + btn + "</div>";
    }).join("");

    $("#rep-grid").innerHTML =
      '<div class="rep-summary"><div class="rep-summary-main">全 ' + total + " 問中 <b>" + answered +
      "</b> 問 解答済み（" + pct(answered, total) + "％）</div>" +
      '<div class="progressbar"><div style="width:' + (total ? answered / total * 100 : 0) + '%"></div></div></div>' +
      '<div class="rep-grid-wrap"><table class="rep-grid-table"><thead>' + head +
      "</thead><tbody>" + rows + "</tbody></table></div>" +
      '<div class="rep-legend">' + legend + "</div>" +
      '<p class="rep-note">セルをタップするとその問題を1問演習できます。色は直近2回の正誤を表します。</p>';

    $$("#rep-grid .rep-cell[data-exam]").forEach(function (b) {
      b.addEventListener("click", function () { jumpTo(b.dataset.exam, parseInt(b.dataset.no, 10)); });
    });
    $$("#rep-grid .rep-legend-go").forEach(function (b) {
      b.addEventListener("click", function () { reviewByStatus(b.dataset.status); });
    });
  }

  function reviewByStatus(status) {
    var stats = D.loadStats();
    var refs = D.all().filter(function (it) { return statusOf(stats[it.key]) === status; })
      .map(function (it) { return [it.exam.examId, it.q.no]; });
    if (!refs.length) return;
    close();
    if (window.AM2PracticeSet) window.AM2PracticeSet(refs);
  }

  /* ---------- 試験回別レポート ---------- */
  function renderExamReport(examId) {
    var stats = D.loadStats();
    var exam = D.exams().filter(function (e) { return e.examId === examId; })[0];
    if (!exam) return;
    var items = D.all().filter(function (it) { return it.exam.examId === examId; });

    var attempts = 0, corrects = 0, seen = 0, dupSame = 0, dupSimilar = 0;
    var byCat = {};
    items.forEach(function (it) {
      var s = stats[it.key];
      if (s && s.a) { attempts += s.a; corrects += s.c; seen += 1; }
      var cat = it.q.category;
      byCat[cat] = byCat[cat] || { a: 0, c: 0, n: 0 };
      byCat[cat].n += 1;
      if (s && s.a) { byCat[cat].a += s.a; byCat[cat].c += s.c; }
      var rel = SIM[it.key] || [];
      var hasSame = rel.filter(function (r) { return r[2] === "same"; }).length > 0;
      if (hasSame) dupSame += 1;
      else if (rel.length) dupSimilar += 1;
    });
    var rate = pct(corrects, attempts);
    var grade = attempts === 0 ? "-" : (rate >= 80 ? "A" : rate >= 60 ? "B" : "C");

    var catRows = Object.keys(byCat).sort(function (a, b) { return byCat[b].n - byCat[a].n; })
      .map(function (cat) {
        var s = byCat[cat], p = pct(s.c, s.a);
        return "<tr><td>" + esc(cat) + ' <span class="cnt">(' + s.n + "問)</span></td>" +
          '<td><span class="minibar"><i style="width:' + p + '%"></i></span>' +
          (s.a ? p + "％" : "未解答") + "</td>" +
          '<td class="num">' + s.c + " / " + s.a + "</td></tr>";
      }).join("");

    var qRows = items.map(function (it) {
      var s = stats[it.key];
      var dots = marksHtml(s);
      var p = (s && s.a) ? pct(s.c, s.a) : null;
      var pClass = p === null ? "" : (p >= 80 ? "good" : p >= 60 ? "mid" : "bad");
      var rel = (SIM[it.key] || []).map(function (r) {
        return '<button type="button" class="rep-rel ' + r[2] + '" data-exam="' + r[0] + '" data-no="' + r[1] +
          '" title="' + (r[2] === "same" ? "同一問題" : "類似問題") + "：" + esc(shortLabel(r[0])) + " 問" + r[1] +
          '">' + (r[2] === "same" ? "同" : "類") + esc(shortLabel(r[0])) + "問" + r[1] + "</button>";
      }).join("");
      var tags = (D.getTags ? D.getTags(it.key) : []).map(function (t) {
        return '<span class="rep-tagchip">' + esc(t) + "</span>";
      }).join("");
      return '<tr class="rep-qrow" data-exam="' + examId + '" data-no="' + it.q.no + '">' +
        '<td class="rep-qno">問' + it.q.no + "</td>" +
        '<td class="rep-qcat"><span class="rep-catname">' + esc(it.q.category) + "</span>" +
        (tags ? '<div class="rep-rels">' + tags + "</div>" : "") +
        (rel ? '<div class="rep-rels">' + rel + "</div>" : "") +
        '<div class="rep-qdots">' + dots + "</div></td>" +
        '<td class="num">' + ((s && s.a) ? "正解 <b>" + s.c + "</b> / " + s.a : "-") + "</td>" +
        '<td class="rep-qrate">' + (p === null ? '<span class="rate-badge none">-</span>'
          : '<span class="rate-badge ' + pClass + '">' + p + "％</span>") + "</td></tr>";
    }).join("");

    $("#rep-exam").innerHTML =
      '<div class="rep-cols"><div class="rep-col-left">' +
      '<div class="rep-box"><div class="rep-box-head">全体<span class="rep-grade g' + grade + '">' +
      grade + "判定</span></div>" +
      '<div class="rep-kpis"><div><span>解答回数</span><b>' + attempts + "</b>回</div>" +
      "<div><span>正解数</span><b>" + corrects + "</b>問</div>" +
      "<div><span>正答率</span><b>" + (attempts ? rate : 0) + "</b>％</div></div>" +
      '<div class="progressbar"><div style="width:' + (attempts ? rate : 0) + '%"></div></div>' +
      '<p class="rep-note">挑戦済み ' + seen + " / " + items.length + "問</p></div>" +
      '<div class="rep-box"><div class="rep-box-head">分野別</div><table class="r-cats">' + catRows + "</table></div>" +
      '<div class="rep-box"><div class="rep-box-head">他年度との重複</div>' +
      '<p class="rep-note">この回の ' + items.length + " 問のうち <b>" + dupSame + "</b> 問が他年度と同一、<b>" +
      dupSimilar + "</b> 問が類似です。右の一覧の「同」「類」バッジをタップすると、その年度の問題を開けます。</p></div>" +
      '</div><div class="rep-col-right">' +
      '<div class="rep-dots-legend"><span class="rep-dot o">○</span>正解' +
      '<span class="rep-dot x">×</span>不正解' +
      (items.filter(function (it) { return hasApprox(stats[it.key]); }).length
        ? '<span class="rep-dots-legend-sub"><span class="rep-dot o approx">○</span>' +
          '<span class="rep-dot x approx">×</span>薄い印は履歴の記録を始める前の解答（件数のみ判明・順序は不明）</span>'
        : "") +
      "</div>" +
      '<table class="rep-qtable"><tbody>' + qRows + "</tbody></table></div></div>";

    $$("#rep-exam .rep-qrow").forEach(function (tr) {
      tr.addEventListener("click", function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest(".rep-rel")) return;
        jumpTo(tr.dataset.exam, parseInt(tr.dataset.no, 10));
      });
    });
    $$("#rep-exam .rep-rel").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        jumpTo(b.dataset.exam, parseInt(b.dataset.no, 10));
      });
    });
  }

  function jumpTo(examId, no) {
    close();
    if (window.AM2Practice) window.AM2Practice(examId, no);
  }

  /* ---------- モーダル制御 ---------- */
  var currentTab = "grid";
  function open(tab) {
    currentTab = tab || "grid";
    var sel = $("#rep-exam-select");
    if (!sel.options.length) {
      examsOrdered().forEach(function (e) {
        var o = document.createElement("option");
        o.value = e.examId;
        o.textContent = e.examLabel;
        sel.appendChild(o);
      });
    }
    $$(".rep-tab").forEach(function (b) { b.classList.toggle("active", b.dataset.rep === currentTab); });
    $("#rep-grid").hidden = currentTab !== "grid";
    $("#rep-exam").hidden = currentTab !== "exam";
    sel.hidden = currentTab !== "exam";
    if (currentTab === "grid") renderGrid(); else renderExamReport(sel.value);
    $("#report-modal").hidden = false;
    document.body.style.overflow = "hidden";
    $("#rep-body").scrollTop = 0;
  }
  function close() {
    $("#report-modal").hidden = true;
    document.body.style.overflow = "";
  }

  $("#btn-report-grid").addEventListener("click", function () { open("grid"); });
  $("#btn-report-exam").addEventListener("click", function () { open("exam"); });
  $("#rep-close").addEventListener("click", close);
  $("#report-modal").addEventListener("click", function (e) {
    if (e.target === $("#report-modal")) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("#report-modal").hidden) close();
  });
  $$(".rep-tab").forEach(function (b) {
    b.addEventListener("click", function () { open(b.dataset.rep); });
  });
  $("#rep-exam-select").addEventListener("change", function () { renderExamReport(this.value); });
})();
