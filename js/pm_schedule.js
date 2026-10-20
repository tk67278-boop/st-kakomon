/* 午後I・午後IIの一覧画面の上部に、本番（11/23）までの週ごとの練習スケジュールを表示する。
   内容は解き方ガイド（summary/pm1_guide.html, pm2_guide.html）の練習計画を、具体的な問題に割り当てたもの。
   チェックは演習記録と同じ保存先（STSync.setPmRecord / st_pm_records_v1）に "sched#モード#課題ID" で保存し、
   午後Iの過去問は演習記録（examId#pm1#問番号 が done）があれば自動でチェック済みにする。 */
(function () {
  "use strict";

  var EXAM_DATE = "2026-11-23";
  var PM_KEY = "st_pm_records_v1";

  // 課題: [id, 種類, 表示名, 開く問題(examId, 問番号) or null]
  var PLAN = {
    pm1: {
      title: "午後I",
      weeks: [
        { start: "2026-10-20", end: "2026-10-26", goal: "ガイドの「問い方別の型」「落とし穴」を読み、直近から4問。ヒントを使ってよい", tasks: [
          ["g1", "todo", "解き方ガイドを読む（問い方別の型・採点講評の落とし穴）", null],
          ["q-2025r07h-1", "q", "令和7年度 問1 スタートアップの新規ビジネス領域", ["2025r07h", 1]],
          ["q-2025r07h-2", "q", "令和7年度 問2 行政の子育て支援", ["2025r07h", 2]],
          ["q-2025r07h-3", "q", "令和7年度 問3 ドラッグストアの新規サービス", ["2025r07h", 3]],
          ["q-2024r06h-1", "q", "令和6年度 問1 ネット事業者の総合金融サービス", ["2024r06h", 1]]
        ] },
        { start: "2026-10-27", end: "2026-11-02", goal: "4問。ヒントは「読む場所」「答え方」まで。対比・採点のメモに落とし穴を書く", tasks: [
          ["q-2024r06h-2", "q", "令和6年度 問2 地方新聞社のビジネスモデル変革", ["2024r06h", 2]],
          ["q-2024r06h-3", "q", "令和6年度 問3 旅館の業務改革", ["2024r06h", 3]],
          ["q-2023r05h-1", "q", "令和5年度 問1 SNS運営会社のブロックチェーン活用", ["2023r05h", 1]],
          ["q-2023r05h-2", "q", "令和5年度 問2 地域のスマートシティ構想", ["2023r05h", 2]]
        ] },
        { start: "2026-11-03", end: "2026-11-09", goal: "4問。ヒントなし・45分で本番どおりに", tasks: [
          ["q-2023r05h-3", "q", "令和5年度 問3 アパレルの新ビジネスプロセス", ["2023r05h", 3]],
          ["q-2023r05h-4", "q", "令和5年度 問4 モーションシミュレーターの事業展開", ["2023r05h", 4]],
          ["q-2022r04h-1", "q", "令和4年度 問1 国際物流会社のDX", ["2022r04h", 1]],
          ["q-2022r04h-2", "q", "令和4年度 問2 製造業の情報システム戦略", ["2022r04h", 2]]
        ] },
        { start: "2026-11-10", end: "2026-11-16", goal: "2問を続けて90分の通し練習を2回", tasks: [
          ["q-2022r04h-3", "q", "令和4年度 問3 スーパーの事業拡大（通し1回目）", ["2022r04h", 3]],
          ["q-2022r04h-4", "q", "令和4年度 問4 AI気象予測の事業計画（通し1回目）", ["2022r04h", 4]],
          ["q-2021r03h-1", "q", "令和3年度 問1 タクシー会社のDX（通し2回目）", ["2021r03h", 1]],
          ["q-2021r03h-2", "q", "令和3年度 問2 店舗とネット通販の融合（通し2回目）", ["2021r03h", 2]]
        ] },
        { start: "2026-11-17", end: "2026-11-22", goal: "最後の通し練習と、間違えた欄の解き直し。11/22は休む", tasks: [
          ["q-2021r03h-3", "q", "令和3年度 問3 印刷会社の写真事業（通し3回目）", ["2021r03h", 3]],
          ["q-2021r03h-4", "q", "令和3年度 問4 AIを用いた筋電義手（通し3回目）", ["2021r03h", 4]],
          ["r1", "todo", "△・×を付けた欄を解き直し、落とし穴メモを読み返す", null]
        ] }
      ]
    },
    pm2: {
      title: "午後II",
      weeks: [
        { start: "2026-10-20", end: "2026-10-26", goal: "事例設定を作り、論文の型を覚える", tasks: [
          ["case1", "todo", "事例設定シート（A社・食品スーパー）を読み、設問アのひな形を声に出して読む", null],
          ["case2", "todo", "事例設定シートの暗記チェック12問をすべて言えるようにする", null],
          ["drill", "todo", "骨子ドリル（共通20問）を解く", null],
          ["guide", "todo", "論文ガイド（ア・イ・ウの型、講評の指摘）を読む", null]
        ] },
        { start: "2026-10-27", end: "2026-11-02", goal: "直近テーマで骨子だけを作る（1テーマ20分）", tasks: [
          ["o-2025r07h-1", "o", "骨子：令和7年度 問1 基幹システムの刷新方針", ["2025r07h", 1]],
          ["o-2025r07h-2", "o", "骨子：令和7年度 問2 DXの企画策定", ["2025r07h", 2]],
          ["o-2024r06h-1", "o", "骨子：令和6年度 問1 DXに向けた新たな情報技術の採用", ["2024r06h", 1]],
          ["o-2024r06h-2", "o", "骨子：令和6年度 問2 新しいビジネスモデルの策定", ["2024r06h", 2]],
          ["o-2023r05h-1", "o", "骨子：令和5年度 問1 改修要望の分析と対応方針", ["2023r05h", 1]]
        ] },
        { start: "2026-11-03", end: "2026-11-09", goal: "残りの骨子と、120分の通し執筆を1本", tasks: [
          ["o-2023r05h-2", "o", "骨子：令和5年度 問2 システムリスク対応方針", ["2023r05h", 2]],
          ["o-2022r04h-1", "o", "骨子：令和4年度 問1 顧客満足度を高める新商品・新サービス", ["2022r04h", 1]],
          ["o-2022r04h-2", "o", "骨子：令和4年度 問2 基幹再構築の開発優先順位", ["2022r04h", 2]],
          ["o-2021r03h-1", "o", "骨子：令和3年度 問1 DXを実現する新サービスの企画", ["2021r03h", 1]],
          ["o-2021r03h-2", "o", "骨子：令和3年度 問2 システム化構想の意見調整", ["2021r03h", 2]],
          ["w1", "w", "通し執筆1本目（120分）→ AI採点", ["2025r07h", 2]]
        ] },
        { start: "2026-11-10", end: "2026-11-16", goal: "通し執筆を2本。前回のAI採点の指摘を反映する", tasks: [
          ["w2", "w", "通し執筆2本目（120分）→ AI採点", ["2025r07h", 1]],
          ["w3", "w", "通し執筆3本目（120分）→ AI採点", ["2024r06h", 2]]
        ] },
        { start: "2026-11-17", end: "2026-11-22", goal: "最後の通し執筆と骨子の見直し。11/22は休む", tasks: [
          ["w4", "w", "通し執筆4本目（120分）", ["2024r06h", 1]],
          ["review", "todo", "事例設定シート（A社）の数字と、全テーマの骨子を見直す", null]
        ] }
      ]
    }
  };

  function syncActive() { return !!(window.STSync && window.STSync.active()); }
  function loadRecords() {
    if (syncActive() && window.STSync.getPm) return window.STSync.getPm() || {};
    try { return JSON.parse(localStorage.getItem(PM_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveRecord(key, rec) {
    if (syncActive() && window.STSync.setPmRecord) { window.STSync.setPmRecord(key, rec); return; }
    var r;
    try { r = JSON.parse(localStorage.getItem(PM_KEY)) || {}; } catch (e) { r = {}; }
    r[key] = rec;
    try { localStorage.setItem(PM_KEY, JSON.stringify(r)); } catch (e) { /* ignore */ }
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function day(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function md(s) { var d = day(s); return (d.getMonth() + 1) + "/" + d.getDate(); }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }

  var currentMode = null;

  function isDone(mode, task, records) {
    var m = records["sched#" + mode + "#" + task[0]];
    if (m && m.s === "done") return true;
    if (task[1] === "q" && task[3]) {
      var r = records[task[3][0] + "#pm1#" + task[3][1]];
      if (r && r.s === "done") return true;
    }
    return false;
  }

  function render(mode) {
    currentMode = mode;
    var el = document.getElementById("pm-schedule");
    if (!el) return;
    var plan = PLAN[mode];
    if (!plan) { el.innerHTML = ""; return; }
    var records = loadRecords();
    var t = today(), exam = day(EXAM_DATE);
    var left = Math.round((exam - t) / 86400000);
    var curIdx = -1;
    plan.weeks.forEach(function (w, i) { if (t >= day(w.start) && t <= day(w.end)) curIdx = i; });
    if (curIdx < 0 && t < day(plan.weeks[0].start)) curIdx = 0;

    var html = '<div class="card sch-card"><div class="group-head"><h2>' + plan.title + ' 練習スケジュール</h2><span class="spacer"></span>' +
      '<span class="sch-left">' + (left > 0 ? "本番（11/23）まで あと<b>" + left + "</b>日" : left === 0 ? "<b>今日が本番</b>" : "本番は終了しました") + '</span></div>';
    plan.weeks.forEach(function (w, i) {
      var done = w.tasks.filter(function (tk) { return isDone(mode, tk, records); }).length;
      var cls = i === curIdx ? " cur" : (curIdx >= 0 && i < curIdx ? " past" : "");
      html += '<details class="sch-week' + cls + '"' + (i === curIdx ? " open" : "") + '>' +
        '<summary><span class="sch-wk">' + (i === curIdx ? "今週" : "第" + (i + 1) + "週") + '</span>' +
        '<span class="sch-date">' + md(w.start) + '〜' + md(w.end) + '</span>' +
        '<span class="sch-goal">' + esc(w.goal) + '</span>' +
        '<span class="sch-cnt' + (done === w.tasks.length ? " ok" : "") + '">' + done + ' / ' + w.tasks.length + '</span></summary><ul class="sch-tasks">';
      w.tasks.forEach(function (tk) {
        var d = isDone(mode, tk, records);
        var auto = tk[1] === "q" && tk[3] && (records[tk[3][0] + "#pm1#" + tk[3][1]] || {}).s === "done";
        html += '<li class="' + (d ? "done" : "") + '"><label><input type="checkbox" data-task="' + esc(tk[0]) + '"' + (d ? " checked" : "") + (auto ? " disabled title=\"演習記録が「済」なので自動でチェック済み\"" : "") + '> ' +
          '<span>' + esc(tk[2]) + '</span></label>' +
          (tk[3] ? ' <button type="button" class="linkbtn sch-open" data-exam="' + esc(tk[3][0]) + '" data-no="' + tk[3][1] + '">開く</button>' : '') + '</li>';
      });
      html += '</ul></details>';
    });
    html += '<p class="sch-note">午後Iの過去問は、演習で「演習記録に保存」すると自動でチェックが付きます。それ以外は自分でチェックしてください。チェックは端末間で同期されます。</p></div>';
    el.innerHTML = html;

    Array.prototype.forEach.call(el.querySelectorAll("input[data-task]"), function (cb) {
      cb.addEventListener("change", function () {
        saveRecord("sched#" + mode + "#" + cb.dataset.task, { s: cb.checked ? "done" : "", t: Date.now() });
        render(mode);
      });
    });
    Array.prototype.forEach.call(el.querySelectorAll(".sch-open"), function (b) {
      b.addEventListener("click", function () {
        var api = mode === "pm1" ? window.PM1Study : window.PM2Study;
        if (api) api.open(b.dataset.exam, Number(b.dataset.no));
      });
    });
  }

  window.PmSchedule = { render: render };
  if (window.STSync && window.STSync.setOnChange) {
    window.STSync.setOnChange(function () {
      var el = document.getElementById("pm-schedule");
      if (currentMode && el && el.offsetParent !== null) render(currentMode);
    });
  }
})();
