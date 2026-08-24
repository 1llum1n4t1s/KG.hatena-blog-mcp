# System Design

この文書は、現在の実装から確認できる `hatena-blog-mcp` の設計正本である。エージェント向けの作業手順と必須コマンドは [AGENTS.md](./AGENTS.md) を参照する。

## 目的と外部境界

本システムは、はてなブログAtomPub APIとはてなフォトライフAtom APIを、Cloudflare Workers上のMCP Streamable HTTPサーバーとして公開する。利用者が持ち込むはてなIDとAPIキーをリクエスト単位で中継するBYOK方式であり、認証情報やアプリケーション状態を保存しない。

外部境界は次の4つである。

- MCPクライアント: `POST /mcp` でJSON-RPCを送信し、Basic Authorizationをリクエストごとに渡す。
- はてなブログAtomPub API: エントリ、固定ページ、カテゴリを読み書きする。
- はてなフォトライフAtom API: 画像メタデータの取得と画像投稿を行う。
- npm利用者: 公開パッケージ `@kagayoi/hatena-blog-mcp` のWorkerモジュールをimportし、利用者自身のWrangler設定からCloudflareへdeployする。

永続ストレージ、KV、D1、Durable Objects、サーバー側セッション、アプリケーションキャッシュは使用しない。

## 主要コンポーネント

| コンポーネント | 責務 |
| --- | --- |
| `src/index.ts` | npmパッケージとWranglerが共有する公開エントリ。default Workerと`createApp`を再exportする |
| `src/adapters/cloudflare/index.ts` | Honoアプリ、CORS、Origin検証、MCPボディ上限、Basic認証、リクエスト単位のtransport生成 |
| `src/mcp/server.ts` | 新しい `McpServer` へ13ツールを登録 |
| `src/mcp/context.ts` | 認証情報、fetch、retry、signal、timeout、request IDをツールへ渡すリクエストスコープ |
| `src/mcp/tools/entries.ts` | エントリ5ツール、部分更新、公開予約条件、競合検出 |
| `src/mcp/tools/pages.ts` | 固定ページ5ツール、部分更新、競合検出 |
| `src/mcp/tools/categories.ts` | カテゴリ一覧ツール |
| `src/mcp/tools/images.ts` | Fotolife画像取得・投稿の2ツール |
| `src/atompub/client.ts` | はてなブログAtomPubのURL構築、HTTP、retry、timeout、上限付きレスポンス読み取り |
| `src/atompub/xml.ts` | Atom/XMLと型付きモデルの相互変換 |
| `src/fotolife/client.ts` | FotolifeのGET/POST、WSSE、timeout、上限付きレスポンス読み取り |
| `src/fotolife/xml.ts` | Fotolife XML、base64画像、記事用記法の変換 |
| `src/mcp/response.ts` | MCP成功結果、日本語エラー、秘密を除いた構造化ログ |
| `src/utils/` | Basic認証、サイズ上限、ストリーム読み取り、retry、XML 1.0文字検証 |

## リクエストデータフロー

1. CloudflareアダプターがOriginを評価する。`ALLOWED_ORIGINS` が空ならワイルドカードCORSを返し、設定時はリスト外の明示的なOriginを403で拒否する。Originを持たない非ブラウザ要求は許可する。
2. `POST /mcp` の本文を16 MiB以内で読み取り、超過時はMCP処理や認証より前に413を返す。
3. Basic Authorizationを `hatena_id:api_key` として解析する。欠落・不正形式は401にする。
4. 認証情報、request signal、`cf-ray`またはUUIDのrequest IDを持つ `ToolContext` を生成する。
5. リクエストごとに新しい `McpServer` と `WebStandardStreamableHTTPServerTransport` を生成する。ツールhandlerはそのリクエストのcontextだけを参照する。
6. ブログ系ツールは `AtomPubClient`、画像系ツールは `FotolifeClient` を呼ぶ。クライアントは30秒timeoutと呼び出し元signalを上流fetchへ渡す。
7. XMLを型付きモデルへ変換し、MCPのtext contentとstructured contentを返す。失敗時は利用者向けメッセージと、秘密を含まない構造化ログを生成する。
8. レスポンス後にtransportとserverをbest-effortでcloseする。

## 認証と秘密情報

- ブログAtomPubでは、受信したBasic Authorizationを上流へそのまま中継する。
- Fotolifeでは、同じ認証情報からリクエストごとにWSSEヘッダを生成する。nonceは `crypto.getRandomValues`、digestはプロトコル要件に従う。
- 認証情報はbinding、環境変数、ストレージ、ログへ保存しない。
- エラーログは操作名、request ID、HTTP status、エラーカテゴリ、エラー型だけを含み、Authorization、レスポンス本文、例外メッセージを含めない。

## Atom/XML境界

- XMLパーサーはnamespace prefixを除いたlocal nameで処理し、任意のprefixと数値文字参照を受け入れる。
- エントリではedit link由来ID、Atom ID、title、content、updated、control/draftを必須とし、yes/no以外の制御値を拒否する。
- XML生成ではXML 1.0で禁止された文字を送信前に拒否し、テキストと属性を用途別にescapeする。
- はてなからのXMLレスポンスは8 MiB、エラーボディは16 KiBまで読み取る。
- 画像はデコード後10 MiB、記事本文は4 MiB、titleは1024文字、identifierは2048文字、カテゴリは100件かつ各256文字を上限とする。

## 更新の不変条件

AtomPubのPUTは部分patchではないため、`update_entry` と `update_page` は先に現在値をGETし、指定された変更をマージしてから完全なPUTを送る。

- 未指定のtitle、content、draft、preview、カテゴリを既存値から維持する。
- `content_type` は既存値を必ず維持し、更新による記法変更を防ぐ。
- `updated` は `touch_updated=true` のときだけ送る。
- `custom_url` は呼び出し側が明示したときだけ送る。省略により既存スラッグを維持する。
- `expected_edited` が指定され、GETした現在値と異なる場合はPUTしない。
- `expected_edited` はGET後からPUTまでを原子的に保護しない。はてなAPIに条件付きPUTを使う実装はないため、この競合窓は残る。
- エントリの既存 `scheduled` はマージ時に維持する。新規投稿で `scheduled=true` を使う場合は `draft=true` と公開日時 `updated` を必須とする。
- `eyecatch_image_url` を明示した場合だけ、HTTP(S)画像を識別用コメント付きHTMLブロックとして本文先頭へ挿入する。これははてなブログの「本文の最初の画像」による自動選択を利用するもので、公式アイキャッチ項目は変更しない。再指定時はこのシステムが挿入した既存ブロックを置換し、オプション省略時は本文を変更しない。

## retry・timeout・エラー

- 429、502、503、504とネットワーク例外をretry対象とする。
- 自動retryはGET、PUT、DELETE、HEAD、OPTIONS、TRACEに限定する。POSTは画像や記事の重複作成を防ぐため再試行しない。
- `Retry-After` を優先し、通常は指数backoff、jitter、最大待機時間を適用する。
- abortは即時伝播し、上流network例外とtimeoutは `AtomPubError` の `network_error` へ正規化する。
- 非成功HTTPレスポンスはstatusに対応する `AtomPubError` へ変換し、MCP層で日本語メッセージへ写像する。

## 採用済み設計判断とトレードオフ

- Streamable HTTPのJSONレスポンスだけを提供する。Workerを単純なステートレス構成にできる一方、stdioクライアントは `mcp-remote` が必要で、SSEは利用できない。
- MCPサーバーをリクエストごとに生成する。生成コストは増えるが、異なる利用者のBYOK認証情報がhandler closureを通じて混在しない。
- CORSは既定でワイルドカードとする。幅広いMCPクライアントと接続できる一方、ブラウザ利用を限定できる環境では `ALLOWED_ORIGINS` の設定が必要である。
- ブログ更新はGET→merge→PUTを採用する。利用者が省略した値を保持できる一方、上流APIに条件付きPUTがないため完全な楽観的排他にはならない。
- Fotolife投稿はWSSEをリクエストごとに生成し、POSTを再試行しない。認証情報と重複投稿のリスクを抑える一方、一時的なnetwork失敗は利用者が結果を確認して再実行する必要がある。
- Fotolifeの一覧ツールは提供しない。実装は画像IDが分かる場合の取得と投稿に限定される。
- Cloudflare環境型をWranglerから生成してcommitする。設定とのずれを `--check` で検出できる一方、生成物が大きくなる。
- npmではコンパイル済みstdio CLIではなく、TypeScriptのCloudflare Workerモジュールを公開する。利用者ごとにWorker名、CORS、観測設定を所有できる一方、利用にはWrangler互換のbundle環境と利用者側の薄いエントリが必要になる。
- npm tarballは `package.json` の `files` で実装・型・利用者向け文書へ限定し、リポジトリのlockfileを含めない。利用者は許容version範囲の修正版を取得できる一方、依存解決結果はリポジトリの開発環境と完全には固定されない。

## 設定と検証境界

`wrangler.jsonc` はcompatibility date、request signal関連flag、`ALLOWED_ORIGINS`、ログ、traceを定義する。`src/worker-configuration.d.ts` はこの設定から生成される。`package.json` は公開名、version、`src/index.ts` のexport、型、tarball内容、public accessを定義する。

自動テストはNode上のVitestで、clients、XML、MCP handlers、Honoアダプターを検証する。Cloudflareへのdeployは行わず、Wranglerのdry-run bundleでWorkerとしてbundle可能なことを確認する。coverage要件と実行コマンドは [AGENTS.md](./AGENTS.md) を参照する。
