/* 午後II 初見骨子20分: 問題文から骨子（見出し・要の1文・部品）だけを20分で作る練習（組込み系を除く）。
   令和4年度以前は初見の問題として、令和5〜7年度は段階学習で扱う問題として出す（段階学習の骨子タブからもここを開く）。
   練習スケジュールの自動チェックと「ランダムに1問」は、初見の問題（令和4年度以前）だけを数える。
   作り終えたら出題趣旨・採点講評・見本の骨子と見比べ、自己チェック・◯△×・AI採点で振り返る。
   問題文・設問・出題趣旨・採点講評は js/data/pm2/*.js（window.PM2_TEXT）、部品は js/data/pm2_parts.js、見本の骨子は js/data/pm2_model.js。
   保存先: ログイン中は users/{uid}/pm2docs/pm2blind（STSync.savePm2Doc）、未ログインは localStorage。 */
(function () {
  "use strict";

  var root = document.getElementById("pm2-blind");
  var pmMain = document.getElementById("pm-main");
  if (!root || !pmMain) return;

  var DOC_KEY = "pm2blind";
  var LOCAL_KEY = "st_pm2blind_v1";
  var MAX_ATTEMPTS = 5;
  var LIMIT_MIN = 20;
  var PARTS = [["a", "ア"], ["i", "イ"], ["u", "ウ"]];
  var CHECKS = [
    "設問ア・イ・ウで問われている要素の一つ一つに、見出しがある",
    "見出しに設問の言葉を使っている（言い換えていない）",
    "問題文の「〜など」「例えば」の観点を、見出しか中身に割り当てた",
    "見出しごとに要の1文（このため、／この結果、／そこで私は、／その結果、など）を決めた",
    "見出しごとにA社の部品（事実・数字）を当てた",
    "出題趣旨が「論述することを求めている」ことに答える骨子になっている",
    "採点講評で「散見された」落とし穴に当てはまっていない",
    "設問ウまで、20分以内に骨子ができた"
  ];
  var STEPS = [
    "設問ア・イ・ウを読み、問われている要素に分ける（「〜は何か」「どのように」「〜とともに」）",
    "要素ごとに見出しを立てる（設問の言葉をそのまま使う。イは3〜4つ、ウは2〜3つ）",
    "問題文の「〜など」「例えば」の観点を、各見出しに割り当てる",
    "見出しごとに要の1文を決める（このため、／この結果、／そこで私は、／その結果、）",
    "A社の部品（事実・数字）を見出しに当てる（下の「部品を挿入」も使える）"
  ];

  var doc = null;   // { attempts: {key: [{t, sec, o:{a,i,u}, checks:[bool], g, ai}]}, drafts: {key: {a,i,u}} }
  var cur = null;   // { key, exam, q, running, startedAt, base, intervalId, done, alerted }
  var useLocal = false;

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(el, sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function paras(t) {
    return String(t || "").split(/\n{2,}/).map(function (b) {
      return b.trim() ? "<p>" + esc(b.trim()).replace(/\n/g, "<br>") + "</p>" : "";
    }).join("");
  }
  function fmtClock(sec) {
    var neg = sec < 0, s = Math.abs(sec);
    return (neg ? "-" : "") + Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }
  function fmtDate(t) {
    var d = new Date(t);
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve(); else reject(new Error("copy failed"));
      } catch (e) { reject(e); }
    });
  }
  function flash(el, text) {
    if (!el) return;
    el.textContent = text;
    setTimeout(function () { if (el.textContent === text) el.textContent = ""; }, 2500);
  }

  /* ---------- 問題（令和4年度以前・組込み系を除く。新しい年度から） ---------- */
  var YEAR_LABEL = {
    "2025r07h": "令和7年度", "2024r06h": "令和6年度", "2023r05h": "令和5年度",
    "2022r04h": "令和4年度", "2021r03h": "令和3年度", "2019r01a": "令和元年度", "2018h30a": "平成30年度",
    "2017h29a": "平成29年度", "2016h28a": "平成28年度", "2015h27a": "平成27年度", "2014h26a": "平成26年度",
    "2013h25a": "平成25年度", "2012h24a": "平成24年度", "2011h23a": "平成23年度", "2010h22a": "平成22年度",
    "2009h21a": "平成21年度"
  };
  var STUDIED = { "2025r07h": true, "2024r06h": true, "2023r05h": true }; // 段階学習で扱う年度（初見ではない）
  function pool() {
    var all = window.PM2_TEXT || {}, out = [];
    Object.keys(all).sort().reverse().forEach(function (examId) {
      if (!YEAR_LABEL[examId]) return;
      (all[examId].questions || []).forEach(function (q) {
        if (/組込み/.test(q.title)) return;
        out.push({ key: examId + "-" + q.no, examId: examId, year: YEAR_LABEL[examId], q: q, studied: STUDIED[examId] === true });
      });
    });
    return out;
  }
  function itemByKey(key) { return pool().filter(function (x) { return x.key === key; })[0] || null; }

  /* ---------- 保存 ---------- */
  function syncActive() { return !!(window.STSync && window.STSync.active() && window.STSync.loadPm2Doc); }
  function normalize(d) {
    d = d && typeof d === "object" ? d : {};
    if (!d.attempts || typeof d.attempts !== "object") d.attempts = {};
    if (!d.drafts || typeof d.drafts !== "object") d.drafts = {};
    if (!d.timers || typeof d.timers !== "object") d.timers = {}; // 作りかけのタイマーの経過秒（一時停止して別の画面へ行っても続きから再開する）
    return d;
  }
  function loadLocal() {
    try { return normalize(JSON.parse(localStorage.getItem(LOCAL_KEY))); } catch (e) { return normalize(null); }
  }
  function loadDoc() {
    if (!syncActive()) return Promise.resolve(loadLocal());
    return window.STSync.loadPm2Doc(DOC_KEY).then(function (d) {
      if (d && d.__error) { useLocal = true; return loadLocal(); }
      return normalize(d);
    });
  }
  function saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(doc)); } catch (e) { /* ignore */ } }
  function saveDoc() {
    doc.t = Date.now();
    if (syncActive() && !useLocal) {
      window.STSync.savePm2Doc(DOC_KEY, doc).then(function (r) {
        if (r && r.__error) { useLocal = true; saveLocal(); }
      });
    } else saveLocal();
  }

  // 練習スケジュールの自動チェック用に、取り組んだ問題を演習記録（st_pm_records_v1）にも "blind#問題" で残す
  function markDone(key) {
    var rk = "blind#" + key, rec = { s: "done", t: Date.now() };
    if (window.STSync && window.STSync.active() && window.STSync.setPmRecord) { window.STSync.setPmRecord(rk, rec); return; }
    try {
      var r = JSON.parse(localStorage.getItem("st_pm_records_v1")) || {};
      r[rk] = rec;
      localStorage.setItem("st_pm_records_v1", JSON.stringify(r));
    } catch (e) { /* ignore */ }
  }

  var GRADE = { o: "◯", t: "△", x: "×" };

  /* ---------- 一覧 ---------- */
  function renderList() {
    stopTimer();
    cur = null;
    var all = pool();
    var items = all.filter(function (x) { return !x.studied; });
    var todo = items.filter(function (x) { return !(doc.attempts[x.key] || []).length; });
    var doneN = items.length - todo.length;
    var html =
      '<div class="card pm2-head-card">' +
        '<div class="group-head"><button type="button" class="linkbtn" id="pb-back">&larr; 午後IIの一覧へ戻る</button></div>' +
        '<h2 class="pm2-title">初見骨子20分</h2>' +
        '<p class="stats-note">問題文から<b>骨子だけ</b>を20分で作ります。本番の最初の20分（5〜25分）の練習です。' +
          '作り終えたら、見本の骨子・IPAの出題趣旨と採点講評と見比べて自己チェックし、必要ならAIに骨子を見てもらいます。文章は書きません。' +
          '令和4年度以前は初見の問題、令和5〜7年度は段階学習で学んだ問題です。</p>' +
        '<div class="pm-panel-actions"><span class="pb-progress">初見の問題 ' + doneN + ' / ' + items.length + ' 問に取り組み済み</span><span class="spacer"></span>' +
          '<button type="button" class="primary" id="pb-random"' + (todo.length ? '' : ' disabled') + '>まだ解いていない初見の問題からランダムに1問</button></div>' +
      '</div>';
    function itemHtml(x) {
      var at = doc.attempts[x.key] || [];
      var last = at[0];
      return '<button type="button" class="pp-item' + (at.length ? ' done' : '') + '" data-key="' + x.key + '">' +
        '<span class="pp-mark">' + (at.length ? "✓" : "") + '</span>' +
        '<span class="pp-item-body"><b>' + esc(x.q.title) + '</b><small>' + esc(x.year) + ' 問' + x.q.no + '</small></span>' +
        '<span class="pp-item-stat">' + (last
          ? at.length + '回・前回 ' + (last.g ? GRADE[last.g] + '・' : '') + 'チェック ' + (last.checks || []).filter(Boolean).length + '/' + CHECKS.length
          : (doc.drafts[x.key] || doc.timers[x.key] ? '作りかけ' : '')) + '</span>' +
      '</button>';
    }
    html += '<div class="card"><div class="group-head"><h2>初見の問題（令和4年度以前）</h2></div><div class="pp-list">' + items.map(itemHtml).join("") + '</div></div>';
    html += '<div class="card"><div class="group-head"><h2>段階学習の問題（令和5〜7年度）</h2></div>' +
      '<p class="stats-note">段階学習で学んだ問題です。見本の文章を思い出しながらではなく、問題文から骨子を組み直す練習に使います。</p>' +
      '<div class="pp-list">' + all.filter(function (x) { return x.studied; }).map(itemHtml).join("") + '</div></div>';
    root.innerHTML = html;
    $("#pb-back").addEventListener("click", close);
    $("#pb-random").addEventListener("click", function () {
      if (!todo.length) return;
      renderDrill(todo[Math.floor(Math.random() * todo.length)].key);
    });
    $all(root, ".pp-item").forEach(function (b) {
      b.addEventListener("click", function () { renderDrill(b.dataset.key); });
    });
    window.scrollTo(0, 0);
  }

  /* ---------- 練習画面 ---------- */
  function setumonHtml(q) {
    return PARTS.map(function (p) {
      return '<div class="pb-q"><b>設問' + p[1] + '</b>' + esc((q.q || {})[p[0]] || "") + '</div>';
    }).join("");
  }
  // 部品のプルダウン。設問ア・イ・ウの欄ごとに、その設問でよく使う部品（pm2_parts.js の k）だけを出す。
  // 「ほかの設問の部品も出す」を選ぶと、その欄だけ全部の部品を出す
  var KANA = { a: "ア", i: "イ", u: "ウ" };
  function partsOptionsHtml(k, all) {
    var groups = window.PM2_PARTS || [];
    return '<option value="">' + (all ? 'すべての部品から挿入…' : '設問' + KANA[k] + 'の部品を挿入…') + '</option>' +
      groups.map(function (g, gi) {
        var opts = g.items.map(function (it, ii) {
          return all || !it.k || it.k.indexOf(k) >= 0 ? '<option value="' + gi + '-' + ii + '">' + esc(it.label) + '</option>' : '';
        }).join("");
        return opts ? '<optgroup label="' + esc(g.group) + '">' + opts + '</optgroup>' : '';
      }).join("") +
      '<option value="' + (all ? 'mine' : 'all') + '">' + (all ? '― 設問' + KANA[k] + 'の部品だけに戻す' : '― ほかの設問の部品も出す') + '</option>';
  }
  function partsSelectHtml(k) {
    if (!(window.PM2_PARTS || []).length) return "";
    return '<select class="pm2-parts-sel pb-parts" data-k="' + k + '" aria-label="設問' + KANA[k] + 'に部品を挿入">' + partsOptionsHtml(k, false) + '</select>';
  }
  function insertAtCursor(ta, text) {
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    var pre = v.slice(0, s), ins = (pre && !/\n$/.test(pre) ? "\n" : "") + text + "\n";
    ta.value = pre + ins + v.slice(e);
    ta.selectionStart = ta.selectionEnd = pre.length + ins.length;
    ta.focus();
  }

  function renderDrill(key) {
    var x = itemByKey(key);
    if (!x) return renderList();
    var base = doc.timers[key] || 0; // 前回一時停止したところから再開する
    cur = { key: key, x: x, running: false, startedAt: 0, base: base, intervalId: null, done: false, alerted: base >= LIMIT_MIN * 60 };
    var draft = doc.drafts[key] || {};
    var q = x.q;
    root.innerHTML =
      '<div class="card pm2-head-card">' +
        '<div class="group-head"><button type="button" class="linkbtn" id="pb-to-list">&larr; 初見骨子20分の一覧へ</button></div>' +
        '<div class="pm2-head-title"><span class="badge pm-no">' + esc(x.year) + ' 問' + q.no + '</span><h2 class="pm2-title">' + esc(q.title) + '</h2></div>' +
        '<details class="pp-hint"><summary>骨子の作り方（5つの手順）</summary><ol class="pb-steps">' +
          STEPS.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ol>' +
          '<p>書き方の例：<br>1.1 事業概要と事業特性 ― このため、発注の精度が利益を左右する ― 40店・生鮮4割<br>' +
          '2.1 〇〇の方針 ― そこで私は、〜とした ― 12億円・3段階</p></details>' +
      '</div>' +
      '<div class="pb-grid">' +
        '<div class="card pb-problem"><div class="group-head"><h2>問題文</h2></div>' +
          '<div class="pb-lead">' + paras(q.lead) + '</div>' + setumonHtml(q) + '</div>' +
        '<div class="card pb-outline">' +
          '<div class="group-head"><h2>骨子</h2><span class="spacer"></span>' +
            '<span class="pp-timer' + (base > LIMIT_MIN * 60 ? ' over' : '') + '" id="pb-timer">' + fmtClock(LIMIT_MIN * 60 - base) + '</span>' +
            '<button type="button" id="pb-timer-btn">' + (base ? '再開' : '開始') + '</button></div>' +
          PARTS.map(function (p) {
            return '<div class="pb-field"><div class="pb-field-head"><label for="pb-ta-' + p[0] + '">設問' + p[1] + '</label>' + partsSelectHtml(p[0]) + '</div>' +
              '<textarea class="pp-ta pb-ta" id="pb-ta-' + p[0] + '" data-k="' + p[0] + '" rows="' + (p[0] === "i" ? 13 : 8) + '" placeholder="' +
              (p[0] === "a" ? "1.1 見出し ― 要の1文 ― 部品・数字\n1.2 …" : p[0] === "i" ? "2.1 見出し ― 要の1文 ― 部品・数字\n2.2 …\n2.3 …" : "3.1 見出し ― 要の1文 ― 部品・数字\n3.2 …") +
              '">' + esc(draft[p[0]] || "") + '</textarea></div>';
          }).join("") +
          '<div class="pm-panel-actions"><span class="pm2-save-status" id="pb-status"></span>' +
            '<button type="button" id="pb-save-draft">作りかけを保存</button>' +
            '<button type="button" class="primary" id="pb-finish">骨子を作り終えた</button></div>' +
        '</div>' +
      '</div>' +
      '<div id="pb-review"></div>' +
      '<div class="card"><div class="group-head"><h2>これまでの練習（最新' + MAX_ATTEMPTS + '件）</h2></div><div id="pb-history"></div></div>';

    $("#pb-to-list").addEventListener("click", function () { saveDraftSilently(); renderList(); });
    $("#pb-timer-btn").addEventListener("click", toggleTimer);
    $("#pb-save-draft").addEventListener("click", function () {
      doc.drafts[key] = readOutline();
      if (usedSec() > 0) doc.timers[key] = usedSec();
      saveDoc();
      flash($("#pb-status"), "作りかけを保存しました");
    });
    $("#pb-finish").addEventListener("click", finish);
    $all(root, ".pb-parts").forEach(function (sel) {
      sel.addEventListener("change", function () {
        if (!sel.value) return;
        if (sel.value === "all" || sel.value === "mine") {
          sel.innerHTML = partsOptionsHtml(sel.dataset.k, sel.value === "all");
          sel.value = "";
          return;
        }
        var ij = sel.value.split("-"), g = (window.PM2_PARTS || [])[+ij[0]], it = g && g.items[+ij[1]];
        if (it) insertAtCursor($("#pb-ta-" + sel.dataset.k), "（" + it.label + "）");
        sel.value = "";
      });
    });
    renderHistory();
    window.scrollTo(0, 0);
  }
  function readOutline() {
    var o = {};
    PARTS.forEach(function (p) { o[p[0]] = $("#pb-ta-" + p[0]).value; });
    return o;
  }
  function outlineEmpty(o) { return !PARTS.some(function (p) { return (o[p[0]] || "").trim(); }); }
  function saveDraftSilently() {
    if (!cur || cur.done || !$("#pb-ta-a")) return;
    var o = readOutline(), old = doc.drafts[cur.key] || {}, changed = false;
    if (PARTS.some(function (p) { return (o[p[0]] || "") !== (old[p[0]] || ""); })) {
      if (outlineEmpty(o)) delete doc.drafts[cur.key]; else doc.drafts[cur.key] = o;
      changed = true;
    }
    var sec = usedSec();
    if (sec !== (doc.timers[cur.key] || 0)) {
      if (sec > 0) doc.timers[cur.key] = sec; else delete doc.timers[cur.key];
      changed = true;
    }
    if (changed) saveDoc();
  }

  /* ---------- タイマー（残り時間。0を過ぎたら超過を赤で表示） ---------- */
  function remaining() {
    if (!cur) return 0;
    var used = cur.base + (cur.running ? Math.floor((Date.now() - cur.startedAt) / 1000) : 0);
    return LIMIT_MIN * 60 - used;
  }
  function usedSec() { return cur ? LIMIT_MIN * 60 - remaining() : 0; }
  function paintTimer() {
    var el = $("#pb-timer");
    if (!el) return;
    var r = remaining();
    el.textContent = fmtClock(r);
    el.classList.toggle("over", r < 0);
    if (r <= 0 && !cur.alerted) {
      cur.alerted = true;
      flash($("#pb-status"), "20分たちました。本番ではここで書き始めます");
    }
  }
  function toggleTimer() {
    if (!cur || cur.done) return;
    var btn = $("#pb-timer-btn");
    if (cur.running) {
      cur.base += Math.floor((Date.now() - cur.startedAt) / 1000);
      cur.running = false;
      clearInterval(cur.intervalId);
      btn.textContent = "再開";
    } else {
      cur.startedAt = Date.now();
      cur.running = true;
      cur.intervalId = setInterval(paintTimer, 500);
      btn.textContent = "一時停止";
      $("#pb-ta-a").focus();
    }
    paintTimer();
  }
  function stopTimer() {
    if (cur && cur.running) {
      cur.base += Math.floor((Date.now() - cur.startedAt) / 1000);
      cur.running = false;
    }
    if (cur && cur.intervalId) clearInterval(cur.intervalId);
  }

  /* ---------- 作り終えた: 記録して出題趣旨・採点講評・自己チェックを出す ---------- */
  function finish() {
    if (!cur) return;
    var o = readOutline();
    if (outlineEmpty(o)) { flash($("#pb-status"), "骨子を書いてから押してください"); return; }
    stopTimer();
    cur.done = true;
    var at = { t: Date.now(), sec: usedSec(), o: o, checks: CHECKS.map(function () { return false; }), g: "", ai: "" };
    at.checks[CHECKS.length - 1] = at.sec > 0 && at.sec <= LIMIT_MIN * 60;
    if (!doc.attempts[cur.key]) doc.attempts[cur.key] = [];
    doc.attempts[cur.key].unshift(at);
    if (doc.attempts[cur.key].length > MAX_ATTEMPTS) doc.attempts[cur.key].length = MAX_ATTEMPTS;
    delete doc.drafts[cur.key];
    delete doc.timers[cur.key];
    saveDoc();
    if (!cur.x.studied) markDone(cur.key);
    $all(root, ".pb-ta").forEach(function (ta) { ta.readOnly = true; });
    $all(root, ".pb-parts").forEach(function (s) { s.disabled = true; });
    $("#pb-timer-btn").disabled = true;
    $("#pb-finish").hidden = true;
    $("#pb-save-draft").hidden = true;
    $("#pb-status").textContent = at.sec > 0 ? "所要 " + fmtClock(at.sec) + " で記録しました" : "記録しました";
    renderReview(0);
    renderHistory();
    $("#pb-review").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderReview(idx) {
    var x = cur.x, at = (doc.attempts[cur.key] || [])[idx];
    if (!at) return;
    var box = $("#pb-review");
    // 広い画面では，左に自分の骨子を固定し，右の見本・出題趣旨・チェック・AI採点と見比べられるようにする
    // （作り終えた直後のスマホでは，すぐ上の入力欄と同じ内容なので左の骨子は出さない）
    var dup = cur.done && idx === 0;
    box.innerHTML =
      '<div class="pb-rv-grid">' +
      '<aside class="pb-rv-mine' + (dup ? ' pb-dup' : '') + '"><div class="card">' +
        '<div class="group-head"><h2>あなたの骨子（' + esc(fmtDate(at.t)) + '）</h2></div>' +
        PARTS.map(function (p) { return '<div class="pb-old"><b>設問' + p[1] + '</b>' + esc(at.o[p[0]] || "") + '</div>'; }).join("") +
        '<div class="pb-rv-nav">' +
          [["pb-rv-model", "見本"], ["pb-rv-ref", "出題趣旨・講評"], ["pb-rv-check", "自己チェック"], ["pb-rv-ai", "AI採点"]].map(function (n) {
            return '<button type="button" class="linkbtn" data-to="' + n[0] + '">' + n[1] + '</button>';
          }).join("") +
        '</div>' +
      '</div></aside>' +
      '<div class="pb-rv-main">' +
      modelHtml(cur.key) +
      '<div class="card" id="pb-rv-ref">' +
        '<div class="group-head"><h2>出題趣旨と採点講評（IPA）</h2></div>' +
        '<p class="stats-note">自分の骨子と見比べます。出題趣旨の「〜を論述することを求めている」の部分が、骨子のどの見出しに当たるかを確かめ、採点講評の「散見された」に当てはまらないかを見ます。</p>' +
        '<div class="pb-ref"><b>出題趣旨</b>' + paras(x.q.shushi) + '</div>' +
        '<div class="pb-ref pb-ref-warn"><b>採点講評</b>' + paras(x.q.kouhyo || "（この問題の講評はありません）") + '</div>' +
      '</div>' +
      '<div class="card" id="pb-rv-check">' +
        '<div class="group-head"><h2>自己チェック</h2><span class="spacer"></span><span class="pp-check-n" id="pb-check-n"></span></div>' +
        '<div class="pp-checks">' + CHECKS.map(function (m, i) {
          return '<label><input type="checkbox" data-i="' + i + '"' + (at.checks && at.checks[i] ? ' checked' : '') + '> ' + esc(m) + '</label>';
        }).join("") + '</div>' +
        '<div class="pb-grade" role="group" aria-label="自己判定"><span>この骨子で書けそうか：</span>' +
          ["o", "t", "x"].map(function (g) {
            return '<button type="button" class="pb-grade-btn g-' + g + (at.g === g ? ' on' : '') + '" data-g="' + g + '">' + GRADE[g] + '</button>';
          }).join("") + '</div>' +
      '</div>' +
      '<div class="card" id="pb-rv-ai">' +
        '<div class="group-head"><h2>AIに骨子を見てもらう</h2></div>' +
        '<div class="pm2-ai-actions"><button type="button" class="primary" id="pb-copy">AI採点用にコピー</button><span class="pm2-copy-status" id="pb-copy-status"></span></div>' +
        '<label class="pm2-field-label" for="pb-ai">AIの結果の貼り付け欄</label>' +
        '<textarea class="pm2-ai-result" id="pb-ai" rows="6" placeholder="AIから返ってきた結果を貼り付けると、この練習の記録に保存されます">' + esc(at.ai || "") + '</textarea>' +
      '</div>' +
      '</div></div>';
    $all(box, ".pb-rv-nav button").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = document.getElementById(b.dataset.to);
        if (t) window.scrollTo(0, window.scrollY + t.getBoundingClientRect().top - 8);
      });
    });
    updateCheckN(at);
    $all(box, ".pp-checks input").forEach(function (cb) {
      cb.addEventListener("change", function () {
        at.checks[Number(cb.dataset.i)] = cb.checked;
        updateCheckN(at);
        saveDoc();
        renderHistory();
      });
    });
    $all(box, ".pb-grade-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        at.g = at.g === b.dataset.g ? "" : b.dataset.g;
        $all(box, ".pb-grade-btn").forEach(function (o) { o.classList.toggle("on", o.dataset.g === at.g); });
        saveDoc();
        renderHistory();
      });
    });
    $("#pb-copy").addEventListener("click", function () {
      copyText(buildPrompt(x, at)).then(function () { flash($("#pb-copy-status"), "コピーしました。AIに貼り付けてください"); },
        function () { flash($("#pb-copy-status"), "コピーできませんでした"); });
    });
    $("#pb-ai").addEventListener("change", function (e) { at.ai = e.target.value; saveDoc(); renderHistory(); });
    if (window.AiView) window.AiView.attach($("#pb-ai")); // 貼り付けた結果を整えて表示（js/mdlite.js）
  }
  // 見本の骨子（js/data/pm2_model.js）。A社の部品だけで組んだ例で，部品は押すと中身が開く
  function modelHtml(key) {
    var m = (window.PM2_MODEL || {})[key];
    if (!m) return "";
    var head = '<div class="group-head"><h2>見本の骨子（A社の部品だけで組んだ例）</h2></div>';
    if (m.skip) return '<div class="card" id="pb-rv-model">' + head + '<p class="stats-note">' + esc(m.skip) + '</p></div>';
    var text = {};
    (window.PM2_PARTS || []).forEach(function (g) { g.items.forEach(function (it) { text[it.label] = it.text; }); });
    return '<div class="card" id="pb-rv-model">' + head +
      '<p class="stats-note">自分の骨子と、見出しの立て方・要の1文・部品の当て方を見比べます。見本は一例です。見出しが設問の言葉に合っていて、部品の当て方に筋が通っていれば、違う組み方でも構いません。</p>' +
      (m.pt ? '<div class="pb-ref"><b>この問題で外さないこと</b><p>' + esc(m.pt) + '</p></div>' : '') +
      '<div class="pb-model-grid">' + PARTS.map(function (p) {
        return '<div class="pb-model"><b class="pb-model-q">設問' + p[1] + '</b>' + (m[p[0]] || []).map(function (h) {
          return '<div class="pb-model-h"><div class="pb-model-title">' + esc(h[0]) + '</div>' +
            '<div class="pb-model-key">要：' + esc(h[1]) + '</div>' +
            '<div class="pb-model-parts">' + h[2].map(function (l) {
              return '<details class="pb-model-part"><summary>' + esc(l) + '</summary><div>' + esc(text[l] || "") + '</div></details>';
            }).join("") + '</div></div>';
        }).join("") + '</div>';
      }).join("") + '</div>' +
    '</div>';
  }
  function updateCheckN(at) {
    var el = $("#pb-check-n");
    if (el) el.textContent = "チェック " + (at.checks || []).filter(Boolean).length + " / " + CHECKS.length;
  }
  // AIに渡す部品の一覧と見本の骨子（改善例をA社の設定に合わせ，見本との違いも見てもらう）
  function partsForPrompt() {
    return (window.PM2_PARTS || []).map(function (g) {
      return "■" + g.group + "\n" + g.items.map(function (it) { return "・" + it.text; }).join("\n");
    }).join("\n");
  }
  function modelForPrompt(key) {
    var m = (window.PM2_MODEL || {})[key];
    if (!m || m.skip) return "";
    return PARTS.map(function (p) {
      return "設問" + p[1] + "\n" + (m[p[0]] || []).map(function (h) {
        return h[0] + "\n　要：" + h[1] + "\n　部品：" + (h[2].length ? h[2].join("、") : "（なし。要の1文で書く）");
      }).join("\n");
    }).join("\n\n");
  }
  function buildPrompt(x, at) {
    var q = x.q;
    var model = modelForPrompt(x.key);
    return [
      "あなたはITストラテジスト試験（午後II・論述式）の採点者です。次の問題に対して受験者が20分で作った「骨子」（見出し・要の1文・使う部品のメモ）を評価してください。文章はまだ書いていません。",
      "",
      "【問題】" + x.year + " 問" + q.no + " " + q.title,
      q.lead,
      "",
      "【設問ア】" + (q.q || {}).a,
      "【設問イ】" + (q.q || {}).i,
      "【設問ウ】" + (q.q || {}).u,
      "",
      "【出題趣旨】" + q.shushi,
      "",
      q.kouhyo ? "【採点講評（IPA公表。この問題で多かった失点の傾向。判定ではこれを優先して使う）】" + q.kouhyo + "\n" : "",
      "【前提】A社は地方の食品スーパー（40店舗・売上800億円・従業員4,000人・生鮮4割・会員60万人）。筆者は情報システム部のシステム企画担当課長。A社は練習用の架空の会社。",
      "",
      "【A社の部品（受験者が事前に用意した事実・数字。論文ではこの中から使う）】",
      partsForPrompt(),
      "",
      model ? "【見本の骨子（A社の部品だけで組んだ一例。正解は一つではない）】\n" + model + "\n" : "",
      "【受験者の骨子】",
      PARTS.map(function (p) { return "設問" + p[1] + "\n" + (at.o[p[0]] || "（なし）"); }).join("\n\n"),
      "",
      "次の形式で答えてください。",
      "1. 設問ア・イ・ウの要素ごとに、対応する見出しがあるか（○・△・×）と一言の理由",
      "2. 出題趣旨とのずれ、問題文の観点（「〜など」「例えば」）の使い漏れ",
      q.kouhyo ? "3. この骨子で書いたときに陥りやすい落とし穴。採点講評が指摘する失点の傾向（「表面的な内容にとどまる」など）に当てはまるかを優先して判定する" : "3. この骨子で書いたときに陥りやすい落とし穴（技術の話で終わる、一般論になる など）",
      "4. 部品の当て方：A社の部品と矛盾する数字・事実はないか、もっと合う部品はないか",
      model ? "5. 見本との違い：違う部分が設問に合っていれば問題なしとし、見本と違うことだけを理由に減点しない。見本のほうが設問に合う部分だけを挙げる" : "5. 見本との違い（この問題は見本がないため省略）",
      "6. この骨子のまま書いた場合の評価の目安（A〜D）",
      "7. 改善した骨子の例（見出し・要の1文・使う部品。部品はA社の部品の中から選ぶ。文章にはしない）"
    ].join("\n");
  }

  function renderHistory() {
    var el = $("#pb-history");
    if (!el || !cur) return;
    var at = doc.attempts[cur.key] || [];
    if (!at.length) { el.innerHTML = '<p class="stats-note">まだ記録はありません。</p>'; return; }
    el.innerHTML = at.map(function (a, i) {
      return '<div class="pp-hist-row"><span>' + esc(fmtDate(a.t)) + '</span>' +
        '<span>所要 ' + (a.sec > 0 ? fmtClock(a.sec) : "―") + '</span>' +
        '<span>チェック ' + (a.checks || []).filter(Boolean).length + '/' + CHECKS.length + '</span>' +
        '<span>' + (a.g ? GRADE[a.g] : "") + '</span>' +
        (a.ai ? '<span class="pp-ai-tag">AI採点あり</span>' : '<span></span>') +
        '<button type="button" class="linkbtn" data-i="' + i + '">見る</button></div>';
    }).join("") +
      (cur.done ? '<div class="pm-panel-actions"><button type="button" id="pb-again">もう一度作る</button>' +
        '<button type="button" id="pb-next">次の問題（未着手からランダム）</button></div>' : '');
    $all(el, ".linkbtn").forEach(function (b) {
      b.addEventListener("click", function () {
        renderReview(Number(b.dataset.i));
        $("#pb-review").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    var again = $("#pb-again");
    if (again) again.addEventListener("click", function () { renderDrill(cur.key); });
    var next = $("#pb-next");
    if (next) next.addEventListener("click", function () {
      var todo = pool().filter(function (x) { return !(doc.attempts[x.key] || []).length; });
      if (todo.length) renderDrill(todo[Math.floor(Math.random() * todo.length)].key);
      else renderList();
    });
  }

  /* ---------- 開閉 ---------- */
  function open(key) {
    if (window.PmPara) window.PmPara.close();
    pmMain.hidden = true;
    root.hidden = false;
    root.innerHTML = '<p class="pm-empty">読み込み中…</p>';
    loadDoc().then(function (d) {
      doc = d;
      if (typeof key === "string" && itemByKey(key)) renderDrill(key);
      else renderList();
    });
  }
  function close() {
    saveDraftSilently();
    stopTimer();
    cur = null;
    root.hidden = true;
    root.innerHTML = "";
    pmMain.hidden = false;
    if (window.PmSchedule && window.PmSchedule.refresh) window.PmSchedule.refresh();
  }

  // ページを閉じる・再読み込みする・アプリを切り替えるときも，作りかけとタイマーの経過を残す
  window.addEventListener("pagehide", function () { saveDraftSilently(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveDraftSilently(); });
  window.PmBlind = { open: open, close: function () { if (!root.hidden) close(); } };
})();
