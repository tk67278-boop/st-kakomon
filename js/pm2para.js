/* 午後II 段落練習: 論文の1段落（約400字）を15〜20分で書く部分練習。
   お題・必須要素・型は js/data/pm2_para.js。書いた段落は端末（ログイン中はクラウド）に保存する。
   保存先: ログイン中は users/{uid}/pm2docs/pm2para（STSync.savePm2Doc）、未ログインは localStorage。 */
(function () {
  "use strict";

  var root = document.getElementById("pm2-para");
  var pmMain = document.getElementById("pm-main");
  if (!root || !pmMain) return;

  var DOC_KEY = "pm2para";
  var LOCAL_KEY = "st_pm2para_v1";
  var MAX_ATTEMPTS = 5;

  var doc = null;          // { attempts: {id: [{t, text, sec, checks: [bool], ai}]}, drafts: {id: text} }
  var cur = null;          // 練習中の状態 { d, sec, running, startedAt, intervalId, done, attemptIdx }
  var useLocal = false;

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(el, sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function drills() { return window.PM2_PARA || []; }
  function drillById(id) { return drills().filter(function (d) { return d.id === id; })[0] || null; }
  function countChars(t) { return String(t || "").replace(/\r?\n/g, "").length; }
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

  /* ---------- 保存 ---------- */
  function syncActive() { return !!(window.STSync && window.STSync.active() && window.STSync.loadPm2Doc); }
  function normalize(d) {
    d = d && typeof d === "object" ? d : {};
    if (!d.attempts || typeof d.attempts !== "object") d.attempts = {};
    if (!d.drafts || typeof d.drafts !== "object") d.drafts = {};
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
  function saveDoc() {
    doc.t = Date.now();
    if (syncActive() && !useLocal) {
      window.STSync.savePm2Doc(DOC_KEY, doc).then(function (r) {
        if (r && r.__error) { useLocal = true; saveLocal(); }
      });
    } else saveLocal();
  }
  function saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(doc)); } catch (e) { /* ignore */ } }

  /* ---------- 一覧 ---------- */
  function renderList() {
    stopTimer();
    cur = null;
    var groups = { "ア": [], "イ": [], "ウ": [] };
    drills().forEach(function (d) { groups[d.part].push(d); });
    var html =
      '<div class="card pm2-head-card">' +
        '<div class="group-head"><button type="button" class="linkbtn" id="pp-back">&larr; 午後IIの一覧へ戻る</button></div>' +
        '<h2 class="pm2-title">段落練習（1段落を15〜20分）</h2>' +
        '<p class="stats-note">論文の1段落（約400字）だけを時間を計って書きます。書き終えたら必須要素を自己チェックし，A社の模範例と見比べます。' +
          '120分の通し執筆の前に，型を体に入れるための練習です。使う設定は<a href="summary/pm2_case.html" target="_blank" rel="noopener">A社の事例設定シート</a>です。</p>' +
      '</div>';
    ["ア", "イ", "ウ"].forEach(function (part) {
      html += '<div class="card"><div class="group-head"><h2>設問' + part + 'の段落</h2></div><div class="pp-list">';
      groups[part].forEach(function (d) {
        var at = doc.attempts[d.id] || [];
        var last = at[0];
        var ok = last ? (last.checks || []).filter(Boolean).length : 0;
        html += '<button type="button" class="pp-item' + (at.length ? ' done' : '') + '" data-id="' + d.id + '">' +
          '<span class="pp-mark">' + (at.length ? "✓" : "") + '</span>' +
          '<span class="pp-item-body"><b>' + esc(d.title) + '</b>' +
            '<small>' + esc(d.theme) + '・' + d.chars + '字・' + d.min + '分</small></span>' +
          '<span class="pp-item-stat">' + (last ? at.length + '回・前回 ' + countChars(last.text) + '字・必須 ' + ok + '/' + d.must.length : (doc.drafts[d.id] ? '書きかけ' : '')) + '</span>' +
        '</button>';
      });
      html += '</div></div>';
    });
    root.innerHTML = html;
    $("#pp-back").addEventListener("click", close);
    $all(root, ".pp-item").forEach(function (b) {
      b.addEventListener("click", function () { renderDrill(b.dataset.id); });
    });
    window.scrollTo(0, 0);
  }

  /* ---------- 練習画面 ---------- */
  function renderDrill(id) {
    var d = drillById(id);
    if (!d) return renderList();
    cur = { d: d, sec: d.min * 60, running: false, startedAt: 0, base: 0, intervalId: null, done: false, attemptIdx: -1 };
    var draft = doc.drafts[d.id] || "";
    var lo = Math.round(d.chars * 0.85), hi = Math.round(d.chars * 1.15);
    root.innerHTML =
      '<div class="card pm2-head-card">' +
        '<div class="group-head"><button type="button" class="linkbtn" id="pp-to-list">&larr; 段落練習の一覧へ</button></div>' +
        '<div class="pm2-head-title"><span class="badge pm-no">設問' + d.part + '</span><h2 class="pm2-title">' + esc(d.title) + '</h2></div>' +
        '<div class="pp-task">' + esc(d.task) + '</div>' +
        '<div class="pp-meta">目安 <b>' + d.chars + '字</b>（' + lo + '〜' + hi + '字）・<b>' + d.min + '分</b>・使う部品：' + esc(d.parts) + '</div>' +
        '<div class="pp-must"><b>必須要素</b><ol>' + d.must.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join("") + '</ol></div>' +
        '<details class="pp-hint"><summary>型と書き出し例を見る（迷ったら）</summary>' +
          '<p><b>型：</b>' + esc(d.form) + '</p><p><b>書き出し例：</b>' + esc(d.opener) + '</p>' +
          '<p><b>よくある失敗：</b>' + esc(d.pitfall) + '</p></details>' +
      '</div>' +
      '<div class="card">' +
        '<div class="group-head"><h2>執筆</h2><span class="spacer"></span>' +
          '<span class="pp-timer" id="pp-timer">' + fmtClock(cur.sec) + '</span>' +
          '<button type="button" id="pp-timer-btn">開始</button></div>' +
        '<textarea class="pp-ta" id="pp-ta" rows="12" placeholder="「開始」を押してから書き始めます。段落の最初は1字下げなくてかまいません。">' + esc(draft) + '</textarea>' +
        '<div class="pm2-count" id="pp-count"></div>' +
        '<div class="pm-panel-actions"><span class="pm2-save-status" id="pp-status"></span>' +
          '<button type="button" id="pp-save-draft">書きかけを保存</button>' +
          '<button type="button" class="primary" id="pp-finish">書き終えた</button></div>' +
      '</div>' +
      '<div id="pp-review"></div>' +
      '<div class="card" id="pp-history-card"><div class="group-head"><h2>これまでの練習（最新' + MAX_ATTEMPTS + '件）</h2></div><div id="pp-history"></div></div>';

    var ta = $("#pp-ta");
    ta.addEventListener("input", updateCount);
    updateCount();
    $("#pp-to-list").addEventListener("click", function () { saveDraftSilently(); renderList(); });
    $("#pp-timer-btn").addEventListener("click", toggleTimer);
    $("#pp-save-draft").addEventListener("click", function () {
      doc.drafts[d.id] = ta.value;
      saveDoc();
      flash($("#pp-status"), "書きかけを保存しました");
    });
    $("#pp-finish").addEventListener("click", finish);
    renderHistory();
    window.scrollTo(0, 0);
  }
  function saveDraftSilently() {
    if (!cur || cur.done) return;
    var ta = $("#pp-ta");
    if (!ta) return;
    var v = ta.value;
    if (v !== (doc.drafts[cur.d.id] || "")) { doc.drafts[cur.d.id] = v; saveDoc(); }
  }
  function updateCount() {
    var el = $("#pp-count"), ta = $("#pp-ta");
    if (!el || !ta || !cur) return;
    var n = countChars(ta.value), d = cur.d;
    var lo = Math.round(d.chars * 0.85), hi = Math.round(d.chars * 1.15);
    el.textContent = n + " / " + d.chars + " 字" + (n < lo ? "（あと" + (lo - n) + "字で目安の範囲）" : n > hi ? "（" + (n - hi) + "字多い）" : "（目安の範囲）");
    el.className = "pm2-count " + (n === 0 ? "muted" : n >= lo && n <= hi ? "ok" : "ng");
  }

  /* ---------- タイマー（残り時間。0を過ぎたら超過を赤で表示） ---------- */
  function remaining() {
    if (!cur) return 0;
    var used = cur.base + (cur.running ? Math.floor((Date.now() - cur.startedAt) / 1000) : 0);
    return cur.d.min * 60 - used;
  }
  function usedSec() { return cur ? cur.d.min * 60 - remaining() : 0; }
  function paintTimer() {
    var el = $("#pp-timer");
    if (!el) return;
    var r = remaining();
    el.textContent = fmtClock(r);
    el.classList.toggle("over", r < 0);
  }
  function toggleTimer() {
    if (!cur || cur.done) return;
    var btn = $("#pp-timer-btn");
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
      $("#pp-ta").focus();
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

  /* ---------- 書き終えた: 記録して自己チェック・模範例・AI採点を出す ---------- */
  function finish() {
    var ta = $("#pp-ta");
    if (!cur || !ta.value.trim()) { flash($("#pp-status"), "段落を書いてから押してください"); return; }
    stopTimer();
    cur.done = true;
    var d = cur.d;
    var at = { t: Date.now(), text: ta.value, sec: usedSec(), checks: d.must.map(function () { return false; }), ai: "" };
    if (!doc.attempts[d.id]) doc.attempts[d.id] = [];
    doc.attempts[d.id].unshift(at);
    if (doc.attempts[d.id].length > MAX_ATTEMPTS) doc.attempts[d.id].length = MAX_ATTEMPTS;
    delete doc.drafts[d.id];
    saveDoc();
    ta.readOnly = true;
    $("#pp-timer-btn").disabled = true;
    $("#pp-finish").hidden = true;
    $("#pp-save-draft").hidden = true;
    $("#pp-status").textContent = "所要 " + fmtClock(at.sec) + "・" + countChars(at.text) + "字で記録しました";
    renderReview(0);
    renderHistory();
    $("#pp-review").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderReview(idx) {
    var d = cur.d, at = (doc.attempts[d.id] || [])[idx];
    if (!at) return;
    cur.attemptIdx = idx;
    var box = $("#pp-review");
    box.innerHTML =
      '<div class="card">' +
        '<div class="group-head"><h2>自己チェック</h2><span class="spacer"></span><span class="pp-check-n" id="pp-check-n"></span></div>' +
        (idx > 0 ? '<p class="stats-note">' + esc(fmtDate(at.t)) + 'の練習（' + countChars(at.text) + '字・所要 ' + fmtClock(at.sec) + '）を表示しています。</p><div class="pp-old">' + esc(at.text) + '</div>' : '') +
        '<p class="stats-note">書いた段落を読み返し，満たしている要素にチェックを付けます。</p>' +
        '<div class="pp-checks">' + d.must.map(function (m, i) {
          return '<label><input type="checkbox" data-i="' + i + '"' + (at.checks && at.checks[i] ? ' checked' : '') + '> ' + esc(m) + '</label>';
        }).join("") + '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="group-head"><h2>模範例（A社）</h2><span class="spacer"></span><span class="pp-check-n">' + countChars(d.model) + '字</span></div>' +
        '<div class="pp-model">' + esc(d.model) + '</div>' +
        '<p class="stats-note"><b>見比べ方：</b>型（' + esc(d.form) + '）の順になっているか，数字と固有の事情（A社ならでは）が入っているかを確認します。模範例の言い回しで使えるものは，事例設定シートの余白にメモしておきます。</p>' +
      '</div>' +
      '<div class="card">' +
        '<div class="group-head"><h2>AI採点</h2></div>' +
        '<div class="pm2-ai-actions"><button type="button" class="primary" id="pp-copy">AI採点用にコピー</button><span class="pm2-copy-status" id="pp-copy-status"></span></div>' +
        '<label class="pm2-field-label" for="pp-ai">AI採点結果の貼り付け欄</label>' +
        '<textarea class="pm2-ai-result" id="pp-ai" rows="6" placeholder="AIから返ってきた結果を貼り付けると，この練習の記録に保存されます">' + esc(at.ai || "") + '</textarea>' +
      '</div>';
    updateCheckN(at);
    $all(box, ".pp-checks input").forEach(function (cb) {
      cb.addEventListener("change", function () {
        at.checks[Number(cb.dataset.i)] = cb.checked;
        updateCheckN(at);
        saveDoc();
        renderHistory();
      });
    });
    $("#pp-copy").addEventListener("click", function () {
      copyText(buildPrompt(d, at)).then(function () { flash($("#pp-copy-status"), "コピーしました。AIに貼り付けてください"); },
        function () { flash($("#pp-copy-status"), "コピーできませんでした"); });
    });
    $("#pp-ai").addEventListener("change", function (e) { at.ai = e.target.value; saveDoc(); });
  }
  function updateCheckN(at) {
    var el = $("#pp-check-n");
    if (el) el.textContent = "必須要素 " + (at.checks || []).filter(Boolean).length + " / " + cur.d.must.length;
  }
  function buildPrompt(d, at) {
    return [
      "あなたはITストラテジスト試験（午後II・論述式）の採点者です。次の段落を，論文の一部として厳しめに採点してください。",
      "",
      "【お題】" + d.task,
      "【目安】" + d.chars + "字程度（実際は" + countChars(at.text) + "字）",
      "【必須要素】",
      d.must.map(function (m, i) { return (i + 1) + ". " + m; }).join("\n"),
      "【前提】A社は地方の食品スーパー（40店舗・売上800億円・従業員4,000人・生鮮4割・会員60万人）。筆者は情報システム部のシステム企画担当課長。",
      "",
      "【段落】",
      at.text,
      "",
      "次の形式で答えてください。",
      "1. 必須要素ごとの判定（○・△・×）と一言の理由",
      "2. 設問に答えているか，一般論になっていないか，具体性（数字・固有の事情）の指摘",
      "3. この段落を論文に使ったときの評価の目安（A〜D）",
      "4. 字数を保ったまま改善したリライト例"
    ].join("\n");
  }

  function renderHistory() {
    var el = $("#pp-history");
    if (!el || !cur) return;
    var at = doc.attempts[cur.d.id] || [];
    if (!at.length) { el.innerHTML = '<p class="stats-note">まだ記録はありません。</p>'; return; }
    el.innerHTML = at.map(function (a, i) {
      return '<div class="pp-hist-row"><span>' + esc(fmtDate(a.t)) + '</span><span>' + countChars(a.text) + '字</span>' +
        '<span>所要 ' + fmtClock(a.sec) + '</span><span>必須 ' + (a.checks || []).filter(Boolean).length + '/' + cur.d.must.length + '</span>' +
        (a.ai ? '<span class="pp-ai-tag">AI採点あり</span>' : '<span></span>') +
        '<button type="button" class="linkbtn" data-i="' + i + '">見る</button></div>';
    }).join("") +
      (cur.done ? '<div class="pm-panel-actions"><button type="button" id="pp-again">もう一度書く</button></div>' : '');
    $all(el, ".linkbtn").forEach(function (b) {
      b.addEventListener("click", function () {
        renderReview(Number(b.dataset.i));
        $("#pp-review").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    var again = $("#pp-again");
    if (again) again.addEventListener("click", function () { renderDrill(cur.d.id); });
  }

  /* ---------- 開閉 ---------- */
  function open() {
    pmMain.hidden = true;
    root.hidden = false;
    root.innerHTML = '<p class="pm-empty">読み込み中…</p>';
    loadDoc().then(function (d) { doc = d; renderList(); });
  }
  function close() {
    saveDraftSilently();
    stopTimer();
    cur = null;
    root.hidden = true;
    root.innerHTML = "";
    pmMain.hidden = false;
  }

  window.PmPara = { open: open, close: function () { if (!root.hidden) close(); } };
})();
