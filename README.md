# Vocab 1935 — 双方向・ごちゃまぜ対応版

元データ: 1935語 / 意味単位: 3553 / 完全クリア: 10659有効正解

## 主な機能
- 英→日 / 日→英 / ごちゃまぜ の3モード
- 意味ごとに別問題、1語義3回正解でクリア
- 目標日から1日の必要ノルマを自動計算
- 不正解は4〜6問後に自動再出題
- 起動ごとにランダムな差し色 + 手動引き直し
- 英語読み上げ（Web Speech API）
- 4択の解答後、誤答選択肢にも対応する英語/日本語を表示
- スマホではクイズを100dvh内にまとめ、通常はページスクロール不要
- 進捗のJSON書き出し/読み込み
- PWA / オフライン対応

## GitHub Pages
ZIPを展開し、このフォルダの中身をGitHubリポジトリ直下へアップロードします。
Settings → Pages → Deploy from a branch → main / root を指定してください。

iPhone/iPadではSafariで公開URLを開き、共有 →「ホーム画面に追加」でPWAとして使えます。

## 進捗の互換性
従来版と同じ localStorage キーを利用しているため、同じGitHub PagesのURLを上書き更新した場合は既存進捗を引き継げます。


## iPhone 17 / Safari表示領域修正
クイズ画面では VisualViewport から実際の表示高さと上端位置を取得し、Safari UIやホーム画面PWAのセーフエリアに追従します。上が隠れて下が余る症状を抑えるため、表示開始・リサイズ・画面回転・Safari UI変化時に再計算します。


## v6: iPhone ホーム画面追加(PWA)表示修正
- standalone時は `visualViewport.offsetTop` を使用せず、`window.innerHeight` をアプリ表示領域として利用。
- status bar styleを `default` に変更し、上部コンテンツがステータスバー裏へ入らないよう修正。
- 固定78pxのヘッダーにsafe-areaを押し込んでいた問題を修正。
- Safari表示では従来どおりVisual Viewport追従。
- 進捗保存キーは変更していません。
