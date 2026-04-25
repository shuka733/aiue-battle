# あいうえバトル Online

ブラウザだけで遊べる、あいうえバトル風のオンライン対戦Webアプリです。GitHub Pagesで静的配信し、端末間の同期はPeerJS/WebRTCのDataConnectionで行います。

## 遊び方

1. ホストが名前を入れて部屋を作成します。
2. 表示された部屋URLを参加者に共有します。
3. ホストがお題を決め、各プレイヤーが自分の端末で秘密の言葉を入力します。
4. 手番プレイヤーが未攻撃のひらがなを選び、該当する人は自動で文字が公開されます。
5. `×` 以外の全文字が公開されたプレイヤーは脱落し、最後まで残った人が勝ちです。

## プレイ方法

### オンラインプレイ

公開中のGitHub Pagesを開きます。

```text
https://shuka733.github.io/aiue-battle/
```

1. ホスト役の人が名前を入力して「部屋を作る」を押します。
2. 表示された部屋URLを参加者に共有します。
3. 参加者は共有URLを開き、名前を入力して「参加」を押します。

端末間の同期にはPeerJS/WebRTCを使います。学校、会社、公共Wi-FiなどでWebRTC通信が制限されている場合は接続できないことがあります。

### ローカルホストプレイ

開発中のアプリを同じPCで確認する場合は、以下を実行します。

```bash
npm install
npm run dev
```

起動後、同じPCのブラウザで次のURLを開きます。

```text
http://localhost:5173/
```

同じPC上でホストと参加者を試す場合は、別タブまたは別ブラウザで同じURLを開いてください。

### ローカルホストプレイ時の別端末アクセスURL

同一Wi-Fi上のスマホ、タブレット、別PCから開く場合は、`npm run dev` 実行時に表示される `Network` のURLを使います。

```text
http://<このPCのIPv4アドレス>:5173/
```

例:

```text
http://192.168.1.23:5173/
```

Viteの表示で `Network` URLが出ない場合は、PowerShellでこのPCのIPv4アドレスを確認できます。

```powershell
ipconfig
```

Windowsのファイアウォール確認が出た場合は、同一Wi-Fi内で試すためにプライベートネットワークのアクセスを許可してください。

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
