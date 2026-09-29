# Vocab 1935

アップロードされた1935語の単語リストを使った、GitHub Pages向けの英単語学習PWAです。

## 主な機能
- 単語カード（英語→日本語）
- 英→日 / 日→英 4択
- スペル入力
- 「苦手 / 微妙 / 覚えた」による復習間隔の調整
- 範囲指定（100語単位・自由指定）
- 未学習 / 復習 / 苦手 / お気に入りで絞り込み
- 単語検索
- 英語音声読み上げ（ブラウザの Speech Synthesis）
- 進捗の端末内保存、JSON書き出し / 読み込み
- オフライン動作
- ライト / ダーク / 端末設定

## GitHub Pages で公開
1. このフォルダの中身をGitHubのリポジトリ直下へアップロードします。
2. GitHubの `Settings` → `Pages` を開きます。
3. `Build and deployment` の Source を `Deploy from a branch` にします。
4. Branch を `main` / `(root)` にして Save。
5. 数分後に表示されたURLへiPhoneのSafariでアクセスします。
6. Safariの共有ボタン →「ホーム画面に追加」でPWAとして使えます。

## データ保存
学習進捗は `localStorage` に保存され、外部サーバーへ送信しません。
端末変更やSafariのデータ消去に備えて、ホーム画面の「進捗を書き出す」でバックアップできます。
