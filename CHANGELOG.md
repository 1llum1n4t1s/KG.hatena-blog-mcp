# Changelog

このファイルは、[Keisuke69/hatena-blog-mcp](https://github.com/Keisuke69/hatena-blog-mcp) から派生したフォーク固有の変更を記録します。フォーク以前の履歴は Git のコミット履歴を参照してください。

形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) を参考にしています。リリース作業ではない変更を先取りしてバージョン番号へ割り当てず、次回リリースまで `Unreleased` に集約します。

## [Unreleased]

## [1.0.4] - 2026-09-01

### Fixed

- 更新時の空タイトル・空カスタムURLを拒否し、GETレスポンスにない予約投稿状態を `false` としてPUTしないよう修正

## [1.0.3] - 2026-09-01

### Changed

- MCP SDK、XMLパーサー、入力検証ライブラリを最新の互換版へ更新

## [1.0.2] - 2026-08-25

### Fixed

- AtomPubとFotolifeの上流timeoutを試行単位にし、`Retry-After` 待機が前試行のtimeoutで中断される問題を修正
- FotolifeのGET再試行でWSSEヘッダを試行ごとに再生成
- `create_page` の `updated` をMCP schemaとhandlerへ配線し、READMEの契約と一致

## [1.0.1] - 2026-08-25

### Changed

- **破壊的変更:** npmパッケージの実行方式をCloudflare Workerモジュールからローカルstdio CLIへ変更。既存利用者はWorker URLと `mcp-remote` を外し、`npx --yes @kagayoi/hatena-blog-mcp@latest` と `HATENA_ID` / `HATENA_API_KEY` をMCPクライアントへ設定してください
- npmパッケージをTypeScriptソースではなく、型宣言を含む `dist/` の実行可能成果物として配布
- MCPクライアントの推奨設定を `npx --yes @kagayoi/hatena-blog-mcp@latest` に変更

### Added

- Node.js 22以上で動作するローカルMCP stdio CLIと `hatena-blog-mcp` コマンド
- `HATENA_ID` / `HATENA_API_KEY` 環境変数から上流API用のBasic認証を生成する起動処理
- 配布用CLIを実プロセスとして起動し、13ツールとアイキャッチ入力schemaを確認するstdio smoke test

### Removed

- Cloudflare Workers / Hono / MCP Streamable HTTPアダプターとWrangler設定・生成型・依存関係
- ローカル利用時の `mcp-remote` ブリッジ要件

## [1.0.0] - 2026-08-24

### Changed

- 正式版としてnpmパッケージとMCPサーバー情報のversionを `1.0.0` に同期

## [0.0.2] - 2026-08-24

### Added

- Cloudflare Workerモジュールとして利用できる公開npmパッケージ `@kagayoi/hatena-blog-mcp`
- はてなフォトライフの画像メタデータ取得と画像投稿を行う `get_image` / `upload_image` ツール
- Fotolife Atom API 用の WSSE 認証と、記事へ貼り付けられる `blog_syntax` の生成
- `update_entry` / `update_page` の `expected_edited` による取得済み版との競合検出
- MCP リクエスト、XML レスポンス、エラーボディ、投稿本文、カテゴリ、画像に対するサイズ・件数上限
- リクエスト中断シグナルと30秒の上流APIタイムアウト
- `wrangler.jsonc` から生成する Cloudflare Workers の環境・ランタイム型
- フォークであることを明示する README の案内
- `create_entry` / `update_entry` で本文先頭画像による自動アイキャッチを利用する `eyecatch_image_url` オプション

### Changed

- XML パーサーを名前空間prefixに依存しない実装へ変更し、数値文字参照も正しく復号
- AtomPub レスポンスの必須ルート・フィールド・yes/no値を厳密に検証
- 自動リトライを GET / PUT / DELETE などの冪等メソッドに限定し、POST の重複作成を防止
- `scheduled=true` の新規投稿で `draft=true` と公開日時 `updated` を必須化
- `ALLOWED_ORIGINS` を `wrangler.jsonc` の永続設定へ移し、リスト外の明示的な Origin を403で拒否
- Wrangler の互換日付、リクエストシグナル設定、ログ・トレース設定を更新
- README、開発資料、ツール一覧、カバレッジ要件を13ツールの現行実装へ同期

### Fixed

- ネットワーク例外が未処理のままMCPクライアントへ漏れる問題
- `fast-xml-parser` 5.7系で数値文字参照が文字列のまま残る問題
- `touch_updated` を持つ更新ツールが冪等と宣言されていた不整合
- カテゴリ文書が名前空間prefixによって解析できない問題
- 通常の `wrangler deploy` でコマンドライン指定のOrigin設定が失われる運用上の問題
- Windowsの改行コード差によってBiomeチェックが失敗する問題

### Security

- Authorizationヘッダの形式・長さ・ヘッダ名を出力していた診断ログを削除
- エラーログを操作名、リクエストID、HTTPステータス、エラーカテゴリ、エラー型だけに限定
- XML 1.0で禁止された制御文字を投稿前に拒否
- 大きすぎるMCPリクエストと上流レスポンスをストリーム読み取り中に拒否
