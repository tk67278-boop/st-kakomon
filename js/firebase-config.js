// Firebaseプロジェクトの設定を貼り付けるファイル。
// null のままならクラウド同期は無効（従来どおり端末内保存のみ）で動作する。
// ※ここに書く apiKey などは「公開しても安全なクライアント識別子」であり、秘密鍵ではない。
//   データ本体へのアクセスはFirestoreセキュリティルール（本人のみ読み書き可）で保護される。
//
// 例:
// window.FIREBASE_CONFIG = {
//   apiKey: "AIza...",
//   authDomain: "xxxx.firebaseapp.com",
//   projectId: "xxxx",
//   storageBucket: "xxxx.appspot.com",
//   messagingSenderId: "...",
//   appId: "1:...:web:..."
// };
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBiY4Unn86wegfjNH_dk3fnBoYnJcHYllg",
  authDomain: "st-kakomon.firebaseapp.com",
  projectId: "st-kakomon",
  storageBucket: "st-kakomon.firebasestorage.app",
  messagingSenderId: "680019817654",
  appId: "1:680019817654:web:ca56416d4fa1195ad9e217"
};
