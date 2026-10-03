# Site Time Limit

サイトごとに1日の利用時間の上限を設定する Firefox 拡張です。
音声・動画の背景再生も利用時間に含めます。データは外部に送信せず、すべてブラウザ内（`storage.local`）に保存します。

## 再起動後も使い続けるには（署名インストール）

一時読み込みは Firefox の再起動で消えます。恒久的に使うには、Mozilla に署名してもらった `.xpi` をインストールします。
署名は非公開（unlisted）でも行えるため、AMO（addons.mozilla.org）で一般公開する必要はありません。

1. AMO の開発者ハブで API キーを発行します
   https://addons.mozilla.org/developers/addon/api/key/
   発行される「JWT issuer」と「JWT secret」を控えます。
2. 依存関係をインストールします
   ```sh
   npm install
   ```
3. 環境変数に API キーを設定して署名します
   ```sh
   export WEB_EXT_API_KEY="<JWT issuer>"
   export WEB_EXT_API_SECRET="<JWT secret>"
   npm run sign
   ```
   成功すると `web-ext-artifacts/` に `.xpi` が出力されます。
4. Firefox で `.xpi` ファイルを開く（または、ファイルを Firefox にドラッグ）してインストールします。

以降の再起動でも拡張と設定は残ります。コードを変更したら `manifest.json` の `version` を上げてから再度 `npm run sign` してください（同じバージョンは再署名できません）。

### 署名せずに使う場合

- Firefox Developer Edition / Nightly / ESR では、`about:config` で `xpinstall.signatures.required` を `false` にすると未署名の `.xpi` を入れられます（通常版の Firefox では無効）。
- 一時読み込み（`about:debugging`）は手軽ですが、再起動で消えます。

## 開発時

```sh
npm run lint   # 静的検査
npm run build  # 未署名の .xpi を作成
```

## 動作の概要

- 計測対象: 操作中のアクティブタブ（Firefox がフォーカス中かつ無操作でない）＋音声を再生中のタブ（背景可）
- 上限: 日付はローカル時刻で0時にリセット。`example.com` の上限は `*.example.com` にも適用
- 上限到達: 該当サイトのタブをブロックページに置き換え（再生も停止）
- 起動時に計測中の状態はリセットされ、ブラウザが閉じていた時間は加算されません
