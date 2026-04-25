# あいうえバトル Online

ブラウザだけで遊べる、あいうえバトル風のオンライン対戦Webアプリです。GitHub Pagesで静的配信し、端末間の同期はPeerJS/WebRTCのDataConnectionで行います。

## 遊び方

1. ホストが名前を入れて部屋を作成します。
2. 表示された部屋URLを参加者に共有します。
3. ホストがお題を決め、各プレイヤーが自分の端末で秘密の言葉を入力します。
4. 手番プレイヤーが未攻撃のひらがなを選び、該当する人は自動で文字が公開されます。
5. `×` 以外の全文字が公開されたプレイヤーは脱落し、最後まで残った人が勝ちです。

## 開発

```bash
npm install
npm run dev
```

同一Wi-Fi上の別端末で試す場合は、開発サーバーが表示するNetwork URLを開いてください。

## テスト/ビルド

```bash
npm run test
npm run build
npm run test:e2e
```

E2EテストにはPlaywrightのブラウザが必要です。

## ルール調査元

- 幻冬舎edu公式: https://www.gentosha-edu.co.jp/book/b640622.html
- ぼくボド ルール詳細: https://boku-boardgame.net/aiue-battle
- BROAD 幻冬舎版紹介: https://broad.tokyo/news/33509
- ゲームマーケット Anaguma版: https://pre.gamemarket.jp/game/178836
- PeerJS: https://peerjs.com/

公式画像、公式キャラクター絵、説明書本文のコピーは使わず、ルール再現とオリジナルUIで構成しています。
