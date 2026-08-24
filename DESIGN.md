# System Design

この文書は、現在の実装から確認できる `hatena-blog-mcp` の設計正本である。作業規約と必須コマンドは [AGENTS.md](./AGENTS.md) を参照する。

## 目的と外部境界

本システムは、はてなブログAtomPub APIとはてなフォトライフAtom APIを、Node.js上のローカルMCP stdioサーバーとして提供する。MCPクライアントから子プロセスとして起動され、標準入力と標準出力だけでMCPメッセージを交換する。

外部境界は次の4つである。

- MCPクライアント: npm CLIを子プロセスとして起動し、stdioでMCPを通信する。
- プロセス環境: `HATENA_ID` と `HATENA_API_KEY` を起動時に渡す。
- はてなブログAtomPub API: エントリ、固定ページ、カテゴリを読み書きする。
- はてなフォトライフAtom API: 画像メタデータの取得と画像投稿を行う。

公開HTTP endpoint、永続ストレージ、サーバー側セッション、アプリケーションキャッシュ、独自更新サービスは使用しない。

## 主要コンポーネント

| コンポーネント | 責務 |
| --- | --- |
| `src/cli.ts` | npmの実行入口。stdioサーバーを起動し、秘密を含まない起動エラーだけをstderrへ出す |
| `src/index.ts` | npmのライブラリ公開入口。サーバーfactory、認証helper、server情報をexportする |
| `src/adapters/stdio/index.ts` | 環境変数から認証contextを作り、`StdioServerTransport` とMCPサーバーを接続する |
| `src/mcp/server.ts` | 1つの `McpServer` へ13ツールを登録する |
| `src/mcp/context.ts` | 認証情報、fetch、retry、signal、timeout、request IDをツールへ渡す |
| `src/mcp/tools/entries.ts` | エントリ5ツール、部分更新、公開予約条件、競合検出、自動アイキャッチ |
| `src/mcp/tools/pages.ts` | 固定ページ5ツール、部分更新、競合検出 |
| `src/mcp/tools/categories.ts` | カテゴリ一覧ツール |
| `src/mcp/tools/images.ts` | Fotolife画像取得・投稿の2ツール |
| `src/atompub/client.ts` | はてなブログAtomPubのURL構築、HTTP、retry、timeout、上限付き読み取り |
| `src/atompub/xml.ts` | Atom/XMLと型付きモデルの相互変換 |
| `src/fotolife/client.ts` | FotolifeのGET/POST、WSSE、timeout、上限付き読み取り |
| `src/fotolife/xml.ts` | Fotolife XML、base64画像、記事用記法の変換 |
| `src/mcp/response.ts` | MCP成功結果、日本語エラー、秘密を除いた構造化ログ |
| `src/utils/` | 認証生成、サイズ上限、ストリーム読み取り、retry、XML 1.0文字検証 |

## プロセスとデータフロー

1. MCPクライアントがNode CLIを起動し、環境変数で認証情報を渡す。
2. stdioアダプターが2値の存在を検証し、`hatena_id:api_key` から上流用Basic Authorizationをメモリ上で生成する。
3. 認証contextを閉じ込めた `McpServer` をプロセスごとに1つ生成し、stdio transportへ接続する。
4. MCP SDKが標準入力のメッセージを各ツールhandlerへdispatchする。
5. ブログ系ツールは `AtomPubClient`、画像系ツールは `FotolifeClient` を呼ぶ。クライアントは30秒timeoutを上流fetchへ適用する。
6. XMLを型付きモデルへ変換し、MCPのtext contentとstructured contentを標準出力へ返す。
7. 失敗時は利用者向けメッセージをMCP結果にし、stderrには秘密を含まない分類済みログだけを出す。

プロセスは認証情報を生存期間中だけ保持する。MCP protocol用の標準出力へ診断ログを書かない。

## 認証と秘密情報

- ブログAtomPubでは、起動時に生成したBasic Authorizationを上流へ送る。
- Fotolifeでは、同じ認証情報からリクエストごとにWSSEヘッダを生成する。nonceは `crypto.getRandomValues`、digestはプロトコル要件に従う。
- `hatena_id` ツール引数はグループブログ用URLのIDだけを上書きし、APIキーは起動時の値を使う。
- 認証情報を引数、永続ストレージ、MCP応答、ログへ出さない。
- エラーログは操作名、任意のrequest ID、HTTP status、エラーカテゴリ、エラー型だけを含む。

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
- `custom_url` は呼び出し側が明示したときだけ送る。
- `expected_edited` が指定され、GETした現在値と異なる場合はPUTしない。
- `expected_edited` はGET後からPUTまでを原子的に保護しない。上流APIに条件付きPUTがないため、この競合窓は残る。
- エントリの既存 `scheduled` はマージ時に維持する。新規投稿の `scheduled=true` には `draft=true` と `updated` を必須とする。
- `eyecatch_image_url` を明示した場合だけ、HTTP(S)画像を識別用コメント付きHTMLブロックとして本文先頭へ挿入する。これは本文の最初の画像による自動選択を利用し、公式アイキャッチ項目は変更しない。再指定時は既存の自動挿入ブロックを置換する。

## retry・timeout・エラー

- 429、502、503、504とnetwork例外をretry対象とする。
- 自動retryはGET、PUT、DELETE、HEAD、OPTIONS、TRACEに限定する。POSTは重複作成を防ぐため再試行しない。
- `Retry-After` を優先し、通常は指数backoff、jitter、最大待機時間を適用する。
- abortは即時伝播し、上流network例外とtimeoutは `AtomPubError` の `network_error` へ正規化する。
- 非成功HTTPレスポンスはstatusに対応する `AtomPubError` へ変換し、MCP層で日本語メッセージへ写像する。

## 採用済み設計判断とトレードオフ

- ローカルstdioだけを提供する。各利用者はNode.jsと認証環境変数を用意する必要がある一方、公開endpointの運用、共有認証面、HTTP中継、外部ホスティングを排除できる。
- MCPサーバーをプロセスごとに生成する。起動中は同じ認証contextを共有するため、別アカウントを使う場合はMCPプロセスを分ける。
- 認証情報は環境変数で渡す。ローカルプロセスからは参照可能だが、プロセス一覧へ露出しやすいコマンドライン引数を避けられる。
- 更新はMCP自身の自己書き換えではなく、起動設定のnpm specへ委ねる。`@latest` は起動時更新を容易にし、version固定は再現性を優先できる。
- ブログ更新はGET→merge→PUTを採用する。省略値を保持できる一方、完全な楽観的排他にはならない。
- Fotolife投稿はWSSEを毎回生成し、POSTを再試行しない。一時的なnetwork失敗では利用者が結果を確認して再実行する必要がある。
- Fotolifeの一覧ツールは提供しない。公式feedの制約に合わせ、画像IDが分かる場合の取得と投稿に限定する。
- npm tarballはコンパイル済みJavaScript、型宣言、利用者向け文書へ限定する。利用者はTypeScriptやリポジトリを必要とせずに起動できる。

## buildと検証境界

`tsconfig.json` は開発時の型検査、`tsconfig.build.json` は `dist/` のJavaScriptと型宣言生成を定義する。`package.json` はCLI、library export、version、tarball内容、public accessを定義する。

自動テストはNode上のVitestでclients、XML、MCP handlers、認証、stdio adapterを検証する。`scripts/smoke-stdio.mjs` はbuild済みCLIを実プロセスとして起動し、MCP initialize、13ツールの列挙、アイキャッチschemaを検証する。coverage要件と必須コマンドは [AGENTS.md](./AGENTS.md) を参照する。
