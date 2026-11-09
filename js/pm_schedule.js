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
      // 課題の4番目: [examId, 問番号, 開くタブ]。タブは steps（段階学習）・outline（骨子）・write（執筆）
      // 文字列のときは画面を開く: blind（初見骨子20分）・blind:問題キー（初見骨子20分のその問題）・para（段落練習）・text（午後II 教科書）・case（事例設定シート）・tree（骨子の型ツリー）
      weeks: [
        { start: "2026-10-20", end: "2026-10-26", goal: "事例設定を作り、論文の型を覚える", tasks: [
          ["case1", "todo", "事例設定シート（A社・食品スーパー）を読み、設問アのひな形を声に出して読む", null],
          ["case2", "todo", "事例設定シートの暗記チェック12問をすべて言えるようにする", null],
          ["drill", "todo", "骨子ドリル（共通20問）を解く", null],
          ["guide", "todo", "論文ガイド（ア・イ・ウの型、講評の指摘）を読む", null]
        ] },
        { start: "2026-10-27", end: "2026-11-02", goal: "段階学習で、骨子から文章を組み立てる流れを覚える（令和7年度の2テーマ）", tasks: [
          ["s-2025r07h-1a", "s", "段階学習：令和7年度 問1 基幹刷新（段階1〜3：見本・選択・穴埋め）", ["2025r07h", 1, "steps"]],
          ["s-2025r07h-1b", "s", "段階学習：令和7年度 問1（段階4：見出しごとに書く）", ["2025r07h", 1, "steps"]],
          ["s-2025r07h-2a", "s", "段階学習：令和7年度 問2 DX（段階1〜3）", ["2025r07h", 2, "steps"]],
          ["s-2025r07h-2b", "s", "段階学習：令和7年度 問2（段階4）", ["2025r07h", 2, "steps"]],
          ["o-2025r07h-1", "o", "骨子：令和7年度 問1 基幹システムの刷新方針（段階学習の後に、見本を見ずに）", ["2025r07h", 1, "outline"]],
          ["o-2025r07h-2", "o", "骨子：令和7年度 問2 DXの企画策定（同上）", ["2025r07h", 2, "outline"]],
          ["p1", "todo", "段落練習：設問アの3つ（事業特性・経営課題と変革・基幹刷新の背景）", null]
        ] },
        { start: "2026-11-03", end: "2026-11-09", goal: "型とネタを固め、週末に通し執筆1本目。初見テーマの骨子20分を2回", tasks: [
          ["tb3", "todo", "教科書 第1〜3章を読み、第3章の選択問題（34問）を解く（選択は毎日10分でよい）", "text"],
          ["nums", "todo", "事例設定シートの「数字の書き出し」で、A社の数字7つ（店舗数・売上高・従業員・生鮮の比率・会員・投資額・年間の効果）と概要欄に答える内容を、見ずに入力して全部正解にする", "case"],
          ["s-2025r07h-1c", "s", "段階学習：令和7年度 問1 基幹刷新を最後まで通す（段階4〜6。済んでいれば段階6の暗唱だけ）", ["2025r07h", 1, "steps"]],
          ["s-2024r06h-1a", "s", "段階学習：令和6年度 問1 新たな情報技術の採用（段階1〜3）", ["2024r06h", 1, "steps"]],
          ["b1", "b", "初見骨子20分（1回目）：出題趣旨・採点講評と見比べる", "blind"],
          ["b2", "b", "初見骨子20分（2回目）", "blind"],
          ["x1", "w", "通し執筆1本目（120分）：令和7年度 問1 基幹刷新 → AI採点 → 指摘された段落だけ書き直す", ["2025r07h", 1, "write"]]
        ] },
        { start: "2026-11-10", end: "2026-11-15", goal: "型ツリーを覚え、7つの型を初見骨子で1周する。毎回「初見骨子20分 → AI採点 → 見本と比べる → 差が大きかった見出しを段落練習で1つ書く」。週末に通し練習1回目", tasks: [
          ["tree1", "todo", "型ツリー：7つの型の見分け方（テーマ→型）と、①〜⑦の見出し・列挙の中身を「隠して覚える」で言えるようにする（毎日10分）", "tree"],
          ["bk-2018h30a-2", "bk", "11/10 初見骨子：①新サービス型 平成30年度 問2 → AI採点 → 見本と比べる", "blind:2018h30a-2"],
          ["bk-2019r01a-2", "bk", "11/10 初見骨子：②ビジネスモデル型 令和元年度 問2 → AI採点 → 見本と比べる", "blind:2019r01a-2"],
          ["bk-2019r01a-1", "bk", "11/11 初見骨子：③DX・業務改革型 令和元年度 問1 → AI採点 → 見本と比べる", "blind:2019r01a-1"],
          ["bk-2013h25a-1", "bk", "11/11 初見骨子：④分析・真因型 平成25年度 問1 → AI採点 → 見本と比べる", "blind:2013h25a-1"],
          ["bk-2022r04h-2", "bk", "11/12 初見骨子：⑤基幹・刷新型 令和4年度 問2 → AI採点 → 見本と比べる", "blind:2022r04h-2"],
          ["bk-2012h24a-2", "bk", "11/12 初見骨子：⑥リスク・事業継続型 平成24年度 問2 → AI採点 → 見本と比べる", "blind:2012h24a-2"],
          ["bk-2017h29a-1", "bk", "11/13 初見骨子：⑦評価・投資効果型 平成29年度 問1 → AI採点 → 見本と比べる", "blind:2017h29a-1"],
          ["bk-2014h26a-1", "bk", "11/13 初見骨子：③DX・業務改革型（2問目）平成26年度 問1 → AI採点 → 見本と比べる", "blind:2014h26a-1"],
          ["tx1", "w", "11/14か11/15 通し練習1回目：平成30年度 問1 IT戦略を本番どおり120分（骨子も時間内）→ AI採点 → 字数・時間配分の反省を書く", ["2018h30a", 1, "write"]]
        ] },
        { start: "2026-11-16", end: "2026-11-22", goal: "7つの型を2周目。1周目で点の低かった型から先に。11/19に通し練習2回目。11/20からは新しい問題をやらない", tasks: [
          ["bk-2023r05h-2", "bk", "11/16 初見骨子：⑥リスク・事業継続型 令和5年度 問2 → AI採点 → 見本と比べる", "blind:2023r05h-2"],
          ["bk-2013h25a-2", "bk", "11/16 初見骨子：②ビジネスモデル型 平成25年度 問2 → AI採点 → 見本と比べる", "blind:2013h25a-2"],
          ["bk-2010h22a-2", "bk", "11/17 初見骨子：④分析・真因型 平成22年度 問2 → AI採点 → 見本と比べる", "blind:2010h22a-2"],
          ["bk-2014h26a-2", "bk", "11/17 初見骨子：⑤基幹・刷新型 平成26年度 問2 → AI採点 → 見本と比べる", "blind:2014h26a-2"],
          ["bk-2017h29a-2", "bk", "11/18 初見骨子：⑦評価・投資効果型 平成29年度 問2 → AI採点 → 見本と比べる", "blind:2017h29a-2"],
          ["bk-2016h28a-1", "bk", "11/18 初見骨子：①新サービス型 平成28年度 問1 → AI採点 → 見本と比べる", "blind:2016h28a-1"],
          ["tx2", "w", "11/19 通し練習2回目：令和3年度 問1 を本番どおり120分 → AI採点 → 通し1回目の反省が直ったか確かめる", ["2021r03h", 1, "write"]],
          ["rv20", "todo", "11/20：型ツリーの全型を「隠して覚える」で通しで言う。自分の骨子とAI採点の指摘を読み返し、よく指摘された点を3つ書き出す", "tree"],
          ["rv21", "todo", "11/21：A社の数字、本番の時間配分（教科書 第9章）、11/20に書き出した3つの点を確認する", null],
          ["rest22", "todo", "11/22：新しいことはせず、教科書 付録の提出前チェックリストを読んで早く寝る", null]
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

  // 初見骨子20分（js/pm2blind.js）は取り組んだ問題数で自動チェック（b1 は1問、b2 は2問…）
  function blindAuto(task, records) {
    var n = Number(task[0].slice(1)) || 0;
    return Object.keys(records).filter(function (k) { return k.indexOf("blind#") === 0 && records[k] && records[k].s === "done"; }).length >= n;
  }

  // 初見骨子（特定の問題）は、その問題の骨子を作り終えていれば自動でチェック
  function blindKeyDone(task, records) {
    var key = String(task[3] || "").replace(/^blind:/, "");
    var r = records["blind#" + key];
    return !!(r && r.s === "done");
  }

  function isDone(mode, task, records) {
    var m = records["sched#" + mode + "#" + task[0]];
    if (m && m.s === "done") return true;
    if (task[1] === "b" && blindAuto(task, records)) return true;
    if (task[1] === "bk" && blindKeyDone(task, records)) return true;
    if (task[1] === "q" && task[3]) {
      var r = records[task[3][0] + "#pm1#" + task[3][1]];
      if (r && r.s === "done") return true;
    }
    return false;
  }

  function openScreen(go) {
    if (go === "blind" && window.PmBlind) window.PmBlind.open();
    else if (go.indexOf("blind:") === 0 && window.PmBlind) window.PmBlind.open(go.slice(6));
    else if (go === "tree") window.open("summary/pm2_tree.html", "_blank", "noopener");
    else if (go === "para" && window.PmPara) window.PmPara.open();
    else if (go === "text") { var t = document.getElementById("pm-text-link"); if (t) t.click(); }
    else if (go === "case") window.open("summary/pm2_case.html#numtest", "_blank", "noopener");
    window.scrollTo(0, 0);
  }

  var TODAY_N = 3;           // 「今週やること」に出す件数
  var PREF_ALL = "st_sch_all_open";
  function loadPref(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function savePref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function taskHtml(mode, tk, records) {
    var d = isDone(mode, tk, records);
    var auto = (tk[1] === "q" && tk[3] && (records[tk[3][0] + "#pm1#" + tk[3][1]] || {}).s === "done") ||
      (tk[1] === "b" && blindAuto(tk, records)) || (tk[1] === "bk" && blindKeyDone(tk, records));
    return '<li class="' + (d ? "done" : "") + '"><label><input type="checkbox" data-task="' + esc(tk[0]) + '"' + (d ? " checked" : "") + (auto ? " disabled title=\"記録があるので自動でチェック済み\"" : "") + '> ' +
      '<span>' + esc(tk[2]) + '</span></label>' +
      (typeof tk[3] === "string" ? ' <button type="button" class="linkbtn sch-go" data-go="' + esc(tk[3]) + '">開く</button>' :
      tk[3] ? ' <button type="button" class="linkbtn sch-open" data-exam="' + esc(tk[3][0]) + '" data-no="' + tk[3][1] + '"' + (tk[3][2] ? ' data-tab="' + esc(tk[3][2]) + '"' : '') + '>開く</button>' : '') + '</li>';
  }

  // 今週（今週の課題が済んでいれば次の週）の未完了の課題を、上から TODAY_N 件だけ出す
  function todayHtml(mode, plan, records, curIdx, left) {
    if (curIdx < 0 || left < 0) return "";
    var idx = curIdx, w = plan.weeks[idx];
    var undone = function (wk) { return wk.tasks.filter(function (tk) { return !isDone(mode, tk, records); }); };
    var rest = undone(w), ahead = false;
    while (!rest.length && idx + 1 < plan.weeks.length) { idx++; w = plan.weeks[idx]; rest = undone(w); ahead = true; }
    var total = plan.weeks[curIdx].tasks.length;
    var doneCur = plan.weeks[curIdx].tasks.filter(function (tk) { return isDone(mode, tk, records); }).length;
    var html = '<div class="card sch-today"><div class="group-head"><h2>' + (ahead ? "次の週の課題" : "今週やること") + '</h2><span class="spacer"></span>' +
      '<span class="sch-left">' + (left > 0 ? "本番（11/23）まで あと<b>" + left + "</b>日" : "<b>今日が本番</b>") + '</span></div>';
    if (!rest.length) return html + '<p class="sch-today-goal">予定した課題はすべて終わりました。</p></div>';
    html += '<p class="sch-today-goal">' + (ahead ? "今週の課題はすべて終わりました。先に進める場合は " + md(w.start) + "〜の課題です。" : "目標：" + esc(w.goal)) + '</p>' +
      '<ul class="sch-tasks sch-today-list">' + rest.slice(0, TODAY_N).map(function (tk) { return taskHtml(mode, tk, records); }).join("") + '</ul>' +
      '<p class="sch-today-foot">上から順に進めてください。' + (ahead ? "" : "今週 " + doneCur + " / " + total + " 完了") +
      (rest.length > TODAY_N ? "・ほかに " + (rest.length - TODAY_N) + " 件" : "") + '</p></div>';
    return html;
  }

  function bind(el, mode) {
    Array.prototype.forEach.call(el.querySelectorAll("input[data-task]"), function (cb) {
      cb.addEventListener("change", function () {
        saveRecord("sched#" + mode + "#" + cb.dataset.task, { s: cb.checked ? "done" : "", t: Date.now() });
        render(mode);
      });
    });
    Array.prototype.forEach.call(el.querySelectorAll(".sch-go"), function (b) {
      b.addEventListener("click", function () { openScreen(b.dataset.go); });
    });
    Array.prototype.forEach.call(el.querySelectorAll(".sch-open"), function (b) {
      b.addEventListener("click", function () {
        var api = mode === "pm1" ? window.PM1Study : window.PM2Study;
        if (api) api.open(b.dataset.exam, Number(b.dataset.no), b.dataset.tab || "");
      });
    });
  }

  function render(mode) {
    currentMode = mode;
    var el = document.getElementById("pm-schedule");
    var todayEl = document.getElementById("pm-today");
    if (!el) return;
    var plan = PLAN[mode];
    if (!plan) { el.innerHTML = ""; if (todayEl) todayEl.innerHTML = ""; return; }
    var records = loadRecords();
    var t = today(), exam = day(EXAM_DATE);
    var left = Math.round((exam - t) / 86400000);
    var curIdx = -1;
    plan.weeks.forEach(function (w, i) { if (t >= day(w.start) && t <= day(w.end)) curIdx = i; });
    if (curIdx < 0 && t < day(plan.weeks[0].start)) curIdx = 0;

    if (todayEl) { todayEl.innerHTML = todayHtml(mode, plan, records, curIdx, left); bind(todayEl, mode); }

    var allOpen = loadPref(PREF_ALL) === "1";
    var html = '<details class="card sch-card" id="sch-all"' + (allOpen ? " open" : "") + '><summary class="sch-all-sum"><h2>' + plan.title + ' 練習スケジュール（全' + plan.weeks.length + '週）</h2>' +
      '<span class="spacer"></span><span class="sch-all-hint">' + (allOpen ? "閉じる" : "全体を見る") + '</span></summary>';
    plan.weeks.forEach(function (w, i) {
      var done = w.tasks.filter(function (tk) { return isDone(mode, tk, records); }).length;
      var cls = i === curIdx ? " cur" : (curIdx >= 0 && i < curIdx ? " past" : "");
      html += '<details class="sch-week' + cls + '"' + (i === curIdx ? " open" : "") + '>' +
        '<summary><span class="sch-wk">' + (i === curIdx ? "今週" : "第" + (i + 1) + "週") + '</span>' +
        '<span class="sch-date">' + md(w.start) + '〜' + md(w.end) + '</span>' +
        '<span class="sch-goal">' + esc(w.goal) + '</span>' +
        '<span class="sch-cnt' + (done === w.tasks.length ? " ok" : "") + '">' + done + ' / ' + w.tasks.length + '</span></summary><ul class="sch-tasks">';
      w.tasks.forEach(function (tk) { html += taskHtml(mode, tk, records); });
      html += '</ul></details>';
    });
    html += '<p class="sch-note">午後Iの過去問は「演習記録に保存」、午後IIの初見骨子20分は「骨子を作り終えた」で自動でチェックが付きます。それ以外は自分でチェックしてください。チェックは端末間で同期されます。</p></details>';
    el.innerHTML = html;
    var all = el.querySelector("#sch-all");
    all.addEventListener("toggle", function () {
      savePref(PREF_ALL, all.open ? "1" : "0");
      var h = all.querySelector(".sch-all-hint");
      if (h) h.textContent = all.open ? "閉じる" : "全体を見る";
    });
    bind(el, mode);
  }

  window.PmSchedule = { render: render, refresh: function () { if (currentMode) render(currentMode); } };
  if (window.STSync && window.STSync.setOnChange) {
    window.STSync.setOnChange(function () {
      var el = document.getElementById("pm-schedule");
      if (currentMode && el && el.offsetParent !== null) render(currentMode);
    });
  }
})();
