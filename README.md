# ST 午前II 過去問トレーナー

ITストラテジスト試験（ST）午前IIの過去問を、nw-siken.com（過去問道場）風に一問一答で学習できるローカルWebアプリです。
※午前Iは免除のため対象外。

## 使い方

- `index.html` をブラウザで開くだけで動作します（サーバ不要）。
- または簡易サーバで起動:

```bash
python -m http.server 8731 --directory D:/sikaku/ST/app
```

→ http://localhost:8731 を開く。

## 機能

- 試験回・分野で出題範囲を絞り込み
- 出題数（10/25/50/全問）、ランダム／順番出題
- 選択肢シャッフル
- 苦手・未挑戦問題の優先出題（正答率の低い順）
- 解答直後に正誤判定＋解説＋出典を表示（キー操作: 1〜4で解答、Enterで次へ）
- 結果画面: 正答率、分野別成績、間違えた問題の一覧と再挑戦
- 学習履歴は localStorage に保存（問題ごとの解答回数・正解数）。設定画面からリセット可能

## 収録データ

**全16試験回・400問**（午前II、各回25問）: 平成21〜30年度秋期、令和元年度秋期、令和3〜7年度春期
（令和2年度はST試験未実施。令和8年度以降はCBT方式移行のため問題非公開）

- データファイル: `js/data/<examId>_am2.js`（試験回ごと）
- 全問、公式解答例PDFとの照合検証済み

出典: IPA 情報処理技術者試験 過去問題（https://www.ipa.go.jp/shiken/mondai-kaiotu/）
原本PDFは `D:\sikaku\ST\kako` に保存。

## 新しい試験回の追加方法

1. IPAから問題PDF（`*_st_am2_qs.pdf`）と解答PDF（`*_st_am2_ans.pdf`）を `D:\sikaku\ST\kako` にダウンロード
2. `js/data/` に新しいデータファイルを作成（既存ファイルの形式をコピー）:

```js
window.QUIZ_DATA = window.QUIZ_DATA || [];
window.QUIZ_DATA.push({
  examId: "2011h23a",            // 並び順に使うID（西暦+和暦+a=秋期）
  examLabel: "平成23年度 秋期",
  session: "午前II",
  questions: [
    {
      no: 1,                     // 問番号
      category: "システム戦略",   // 分野（設定画面のフィルタに自動反映）
      question: "問題文…",        // \n で改行
      choices: ["…", "…", "…", "…"],  // ア/イ/ウ/エ の順
      answer: 0,                 // 正解 0=ア 1=イ 2=ウ 3=エ
      explanation: "解説…",
      image: "img/xxx.png",      // 図がある場合のみ（任意）
      html: "<table class=\"qtable\">…</table>"  // 表がある場合のみ（任意）
    },
    // …25問
  ]
});
```

3. `index.html` の `<script src="js/data/...">` に1行追加

### 注意（PDFからの抽出について)

- IPAの**問題冊子PDFはテキスト抽出不可**（保護されたアウトライン文字）。ページを画像化（pypdfium2等）して読み取る必要がある
- **解答例PDFはpdftotextでテキスト抽出可能**
- 図を含む問題は、ページ画像から図の部分を切り出して `img/` に置き、`image` フィールドで参照する

## フォルダ構成

```
app/
├── index.html        # 本体（設定/出題/結果の3画面SPA）
├── css/style.css     # スタイル（ダークモード対応）
├── js/app.js         # ロジック
├── js/data/*.js      # 試験回ごとの問題データ
└── img/*.png         # 問題の図（PDFから切り出し）
```
