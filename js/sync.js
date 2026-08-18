/* 学習履歴のクラウド同期 (Firebase Auth + Firestore)
   - window.FIREBASE_CONFIG が設定されている場合のみ有効化
   - ログイン中: Firestoreの users/{uid} ドキュメントが履歴の正となり、
     端末間でリアルタイム同期される（オフライン時はSDKのキャッシュが吸収）
   - 未ログイン/設定なし: 何もしない（app.jsはlocalStorageで従来どおり動作） */
(function () {
  "use strict";

  var STATS_KEY = "st_am2_stats_v1"; // app.jsと同じローカル保存キー
  var PM_KEY = "st_pm_records_v1";   // pm.jsと同じローカル保存キー
  var state = {
    ready: false,     // SDK初期化済み
    user: null,       // ログイン中のユーザ
    stats: {},        // クラウド由来の履歴（ログイン中の正）
    pm: {},           // クラウド由来の午後演習記録（ログイン中の正）
    unsubscribe: null,
    onChange: []      // app.js / pm.js が登録するUI更新コールバック（複数可）
  };

  function fireOnChange() {
    state.onChange.forEach(function (cb) { cb(); });
  }

  var SDK_BASE = "https://www.gstatic.com/firebasejs/10.14.1/";
  var SDK_FILES = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("load failed: " + src)); };
      document.head.appendChild(s);
    });
  }

  function docRef() {
    return firebase.firestore().collection("users").doc(state.user.uid);
  }

  // 未ログイン時にローカルへ貯まった履歴を、初回ログイン時にクラウドへ合算して取り込む
  function migrateLocalToCloud() {
    var localStats, localPm;
    try { localStats = JSON.parse(localStorage.getItem(STATS_KEY)) || {}; }
    catch (e) { localStats = {}; }
    try { localPm = JSON.parse(localStorage.getItem(PM_KEY)) || {}; }
    catch (e) { localPm = {}; }
    if (!Object.keys(localStats).length && !Object.keys(localPm).length) return Promise.resolve();

    var db = firebase.firestore();
    var ref = docRef();
    return db.runTransaction(function (tx) {
      return tx.get(ref).then(function (snap) {
        var stats = (snap.exists && snap.data().stats) || {};
        var pm = (snap.exists && snap.data().pm) || {};
        Object.keys(localStats).forEach(function (key) {
          var inc = localStats[key];
          if (!inc || typeof inc.a !== "number") return;
          var cur = stats[key] || { a: 0, c: 0, t: 0 };
          stats[key] = {
            a: cur.a + inc.a,
            c: Math.min(cur.c + (inc.c || 0), cur.a + inc.a),
            t: Math.max(cur.t || 0, inc.t || 0)
          };
        });
        // 午後演習記録は積算ではなく、更新時刻(t)が新しい方を採用する
        Object.keys(localPm).forEach(function (key) {
          var inc = localPm[key];
          if (!inc) return;
          var cur = pm[key];
          if (!cur || (inc.t || 0) >= (cur.t || 0)) pm[key] = inc;
        });
        tx.set(ref, { stats: stats, pm: pm, updatedAt: Date.now() }, { merge: true });
      });
    }).then(function () {
      // 二重取り込み防止のためローカル側は空にする（クラウドが正になる）
      try { localStorage.removeItem(STATS_KEY); } catch (e) { /* ignore */ }
      try { localStorage.removeItem(PM_KEY); } catch (e) { /* ignore */ }
    });
  }

  function subscribe() {
    if (state.unsubscribe) state.unsubscribe();
    state.unsubscribe = docRef().onSnapshot(function (snap) {
      state.stats = (snap.exists && snap.data().stats) || {};
      state.pm = (snap.exists && snap.data().pm) || {};
      renderUi();
      fireOnChange();
    }, function (err) {
      console.warn("sync onSnapshot error", err);
    });
  }

  function handleUser(user) {
    state.user = user;
    if (state.unsubscribe) { state.unsubscribe(); state.unsubscribe = null; }
    state.stats = {};
    state.pm = {};
    if (user) {
      migrateLocalToCloud().catch(function (e) { console.warn("migrate failed", e); })
        .then(subscribe);
    } else {
      renderUi();
      fireOnChange();
    }
    renderUi();
  }

  function login() {
    var provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).catch(function () {
      // モバイル等でポップアップが塞がれた場合はリダイレクト方式に切替
      return firebase.auth().signInWithRedirect(provider);
    });
  }

  function logout() {
    if (confirm("同期をログアウトします。この端末では以後、端末内保存に切り替わります。")) {
      firebase.auth().signOut();
    }
  }

  /* ---------- 学習履歴カード内の同期UI ---------- */
  function renderUi() {
    var el = document.getElementById("sync-ui");
    if (!el) return;
    if (!state.ready) { el.innerHTML = ""; return; }
    if (state.user) {
      el.innerHTML = '<span class="sync-badge on">同期ON</span> ' +
        '<span class="sync-mail"></span> ' +
        '<button class="linkbtn" id="btn-sync-logout">ログアウト</button>';
      el.querySelector(".sync-mail").textContent = state.user.email || "";
      el.querySelector("#btn-sync-logout").addEventListener("click", logout);
    } else {
      el.innerHTML = '<span class="sync-badge off">同期OFF</span> ' +
        '<button id="btn-sync-login">Googleでログインして端末間同期</button>';
      el.querySelector("#btn-sync-login").addEventListener("click", login);
    }
  }

  /* ---------- app.js / pm.js 向け公開API ---------- */
  window.STSync = {
    active: function () { return !!(state.ready && state.user); },
    getStats: function () { return state.stats; },
    getPm: function () { return state.pm; },
    setOnChange: function (cb) { state.onChange.push(cb); },
    recordAnswer: function (key, rec) {
      state.stats[key] = rec; // 体感即時反映（snapshotでも同値に更新される）
      docRef().update(new firebase.firestore.FieldPath("stats", key), rec, "updatedAt", Date.now())
        .catch(function () {
          // ドキュメント未作成の場合は全体setで救済
          var stats = {};
          stats[key] = rec;
          docRef().set({ stats: stats, updatedAt: Date.now() }, { merge: true });
        });
    },
    setPmRecord: function (key, rec) {
      state.pm[key] = rec; // 体感即時反映（snapshotでも同値に更新される）
      docRef().update(new firebase.firestore.FieldPath("pm", key), rec, "updatedAt", Date.now())
        .catch(function () {
          // ドキュメント未作成の場合は全体setで救済
          var pm = {};
          pm[key] = rec;
          docRef().set({ pm: pm, updatedAt: Date.now() }, { merge: true });
        });
    },
    mergeIn: function (incoming) {
      var stats = state.stats;
      var merged = 0;
      Object.keys(incoming).forEach(function (key) {
        var inc = incoming[key];
        if (!inc || typeof inc.a !== "number" || typeof inc.c !== "number") return;
        var cur = stats[key] || { a: 0, c: 0, t: 0 };
        stats[key] = {
          a: cur.a + inc.a,
          c: Math.min(cur.c + inc.c, cur.a + inc.a),
          t: Math.max(cur.t || 0, inc.t || 0)
        };
        merged++;
      });
      docRef().set({ stats: stats, updatedAt: Date.now() }, { merge: true });
      return merged;
    },
    // 午後演習記録のインポート用マージ（積算ではなく t が新しい方を採用）
    mergePmIn: function (incoming) {
      var pm = state.pm;
      var merged = 0;
      Object.keys(incoming).forEach(function (key) {
        var inc = incoming[key];
        if (!inc) return;
        var cur = pm[key];
        if (!cur || (inc.t || 0) >= (cur.t || 0)) { pm[key] = inc; merged++; }
      });
      docRef().set({ pm: pm, updatedAt: Date.now() }, { merge: true });
      return merged;
    },
    resetAll: function () {
      state.stats = {};
      // { merge: true } を付けて stats フィールドのみ空にする（pm 等の他フィールドは保持する）
      docRef().set({ stats: {}, updatedAt: Date.now() }, { merge: true });
    }
  };

  /* ---------- 起動 ---------- */
  if (!window.FIREBASE_CONFIG) return; // 設定なし: 同期機能は完全に無効

  Promise.all(SDK_FILES.map(function (f) { return loadScript(SDK_BASE + f); }))
    .then(function () {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      // オフライン永続化（複数タブ対応）。環境により使えないことがあるため待たずに進める
      try {
        firebase.firestore().enablePersistence({ synchronizeTabs: true })
          .catch(function () { /* private mode等では無効のまま */ });
      } catch (e) { /* ignore */ }
      state.ready = true;
      firebase.auth().onAuthStateChanged(handleUser);
      renderUi();
    })
    .catch(function (e) {
      console.warn("Firebase初期化に失敗（端末内保存で継続）", e);
    });
})();
