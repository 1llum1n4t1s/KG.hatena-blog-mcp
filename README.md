# hatena-blog-mcp

日本語 | [English README](./README.en.md)

> [!IMPORTANT]
> このリポジトリは [Keisuke69/hatena-blog-mcp](https://github.com/Keisuke69/hatena-blog-mcp) をフォークし、独自に保守している非公式の派生版です。はてなフォトライフ対応、更新競合の検出、入力・レスポンス上限、Cloudflare Workers 向けの堅牢化など、フォーク固有の変更を含みます。これらの変更に関する Issue は[このフォーク](https://github.com/1llum1n4t1s/KG.hatena-blog-mcp/issues)へ報告してください。変更内容は [CHANGELOG.md](./CHANGELOG.md) にまとめています。

[はてなブログ AtomPub API](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom) と [はてなフォトライフ AtomAPI](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom/) を **読み書き両対応** でラップした MCP (Model Context Protocol) サーバーです。**Cloudflare Workers** 上で動かすことを想定し、**BYOK (Bring Your Own Key)** モデルを採用しています。

もともとのユースケースは「Claude にブログ全記事のカテゴリを一括で付け替えてもらう」こと。タイトル・本文・投稿日時を誤って書き換えずに、カテゴリだけを安全に更新できるように設計されています。

## 特徴

- エントリ: `list_entries`, `get_entry`, `create_entry`, `update_entry`, `delete_entry`
- 固定ページ: `list_pages`, `get_page`, `create_page`, `update_page`, `delete_page`
- カテゴリ: `list_categories`
- 画像: `get_image`, `upload_image`
- **安全な部分更新**: `update_entry` / `update_page` は、明示的に変更しない限り既存のタイトル・本文・記法・投稿日時・スラッグを維持します。本文の `content_type` は常に既存エントリの値を使うため、Markdown がプレーンテキストに黙って切り替わることもありません。
- サーバー側に一切の状態を持たない — 認証情報はリクエストごとの `Authorization` ヘッダにのみ存在します。

## トランスポート

- **MCP Streamable HTTP のみ** (`POST /mcp`、JSON レスポンスモード)
- stdio は非対応 — stdio しか喋れないクライアントでは [`mcp-remote`](https://github.com/geelen/mcp-remote) を介してください
- SSE は非対応

## エンドポイント

| メソッド | パス | 用途 |
| --- | --- | --- |
| `POST` | `/mcp` | MCP Streamable HTTP のエントリポイント |
| `OPTIONS` | `/mcp` | CORS プリフライト |
| `GET` | `/` | ヘルスチェック / サーバー情報の JSON |

---

## クイックスタート: Cloudflare Workers へのデプロイ

### 前提条件

- Node.js 22 以上
- pnpm 10 以上
- Cloudflare アカウントと、Workers をデプロイできる権限

```sh
pnpm install
pnpm exec wrangler login
pnpm exec wrangler deploy
```

以上です。シークレットも KV も Durable Objects も不要 — 認証情報はクライアントがリクエストごとに渡します。URL は `https://hatena-blog-mcp.<あなたのサブドメイン>.workers.dev` のような形になります。

### オプションの Wrangler 変数

| 変数 | デフォルト | 説明 |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | 空文字 → `*` | カンマ区切りの CORS 許可オリジンリスト (例: `https://claude.ai,https://chatgpt.com`)。値を設定すると、リスト外の明示的な `Origin` を preflight を含め 403 で拒否します。空文字は幅広い MCP クライアントとの互換性を保つ既定値です。 |

`wrangler.jsonc` の `vars` を編集してから通常どおり deploy してください。コマンドラインだけの `--var` は、次回の通常 deploy で消えるため使いません。

```jsonc
"vars": {
  "ALLOWED_ORIGINS": "https://claude.ai,https://chatgpt.com"
}
```

---

## 認証 (BYOK)

このサーバーは **認証情報を一切保存しません**。各リクエストには以下を必ず含めてください:

```
Authorization: Basic base64(hatena_id:api_key)
```

API キーは **はてなブログ → 設定 → 詳細設定 → AtomPub** から取得できます。`hatena_id` はブログ URL の左側部分 (`<hatena_id>.hatenablog.com`) です。

同じ Worker を複数人で共有して、それぞれが自分の API キーを使うこともできます。

---

## クライアント設定

### Claude Desktop / Claude.ai Web / モバイル (ネイティブのリモート MCP)

新しいリモート MCP サーバーを追加して、Worker の URL を指定します:

- **URL**: `https://hatena-blog-mcp.<あなたのサブドメイン>.workers.dev/mcp`
- **Auth**: Basic 認証、ユーザー名 = はてなID、パスワード = AtomPub API キー

### Claude Code (または stdio しか話せないクライアント) を `mcp-remote` 経由で

`mcp-remote` はローカルで stdio ↔ Streamable HTTP をブリッジします:

```jsonc
// ~/.claude.json または各クライアントの設定ファイル
{
  "mcpServers": {
    "hatena-blog": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://hatena-blog-mcp.<あなたのサブドメイン>.workers.dev/mcp",
        "--header",
        "Authorization: Basic ${BASIC_AUTH}"
      ],
      "env": {
        "BASIC_AUTH": "<base64(hatena_id:api_key)>"
      }
    }
  }
}
```

Base64 値は `printf '%s' 'hatena_id:api_key' | base64` で生成します。

### MCP Inspector (手動での動作確認用)

```sh
pnpm exec wrangler dev  # 別ターミナルで起動
npx @modelcontextprotocol/inspector
```

Inspector では **Streamable HTTP** を選択し、URL に `http://localhost:8787/mcp`、カスタムヘッダに `Authorization: Basic <base64>` を設定します。

---

## ツールリファレンス

ブログ・固定ページ・カテゴリのツールは必須引数として `blog_id` (例: `example.hatenablog.com`) を取り、任意で `hatena_id` を指定できます (`Authorization` ヘッダのユーザー名を上書き — グループブログで便利)。画像ツールは認証ヘッダのはてなIDに紐づくフォトライフを操作するため `blog_id` は不要です。

### エントリ

| 名前 | 用途 | 必須 | 主なオプション |
| --- | --- | --- | --- |
| `list_entries` | エントリ一覧 (1ページ7件) | `blog_id` | `page`, `include_html` |
| `get_entry` | 1件取得 | `blog_id`, `entry_id` | `include_html` |
| `create_entry` | 新規投稿 | `blog_id`, `title`, `content` | `content_type`, `categories`, `draft`, `preview`, `scheduled` (`true` には `draft: true` + `updated` が必須), `custom_url` |
| `update_entry` | **部分更新** | `blog_id`, `entry_id` | `title`, `content`, `categories` (`[]` でクリア), `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_entry` | 削除 | `blog_id`, `entry_id` | — |

`update_entry` の仕様:
- 省略したフィールドは既存エントリの値を維持します。
- `content_type` は **常に** 既存エントリから取得 — このツール経由で Markdown ↔ プレーンテキストを切り替えることはできません。
- `updated` は `touch_updated: true` のときだけ送信されます (デフォルト: 投稿日時を維持)。
- `custom_url` は明示指定した場合のみ送信されます (デフォルト: 既存スラッグを維持)。
- 直前の取得結果にある `edited` を `expected_edited` に渡すと、取得済みの版から変更されていた場合は PUT せず競合エラーにします。はてな API に条件付き PUT はないため、サーバー側 GET と PUT の間まで原子的に保証するものではありません。

### 固定ページ

エントリとほぼ同じ形ですが、`categories` と `scheduled` はありません。`create_page` では `custom_url` が必須です (はてなはこれをページの恒久的なスラッグとして扱います)。`update_page` でも `expected_edited` を競合検出に利用できます。

### カテゴリ

- `list_categories` → `{ categories: string[], fixed: boolean }`。`fixed: true` の場合、このブログでは新しいカテゴリを追加できません。

### 画像 (はてなフォトライフ)

| 名前 | 用途 | 必須 | 主なオプション |
| --- | --- | --- | --- |
| `get_image` | 画像メタデータを1件取得 | `image_id` | — |
| `upload_image` | 画像を投稿し、記事用 `blog_syntax` を取得 | `title`, `content_type`, `data_base64` | `folder` (既定: `Hatena Blog`) |

画像操作の認証は、リクエストの Basic 認証情報からリクエストごとに WSSE を生成します。APIキーをサーバーへ保存しません。重複投稿を避けるため `upload_image` の POST は自動リトライしません。

画像はデコード後 10 MiB までです。MCP リクエストは 16 MiB、はてなから受け取る XML は 8 MiB、エラーボディは 16 KiB に制限しています。

フォトライフ公式feedはブログ編集画面から投稿した非公開「Hatena Blog」フォルダを列挙しないため、一覧ツールは提供しません。記事本文のfotolife記法から画像IDを取得し、`get_image` で確認してください。

---

## 使用例: カテゴリの一括付け替え (本プロジェクトの原点)

MCP サーバーを接続したら、Claude に次のように頼むだけです:

> 「私のブログ `example.hatenablog.com` の全エントリを `list_entries` で列挙して、各エントリの本文を読んだうえで既存カテゴリを整理し直してください。タイトル・本文・投稿日時は絶対に変更しないでください。」

`update_entry` は既存値を取得してからマージするため、Claude は更新対象と直前に確認した `edited` を次のように渡せます:

```json
{
  "name": "update_entry",
  "arguments": {
    "blog_id": "example.hatenablog.com",
    "entry_id": "3000000000000000010",
    "expected_edited": "2026-04-18T10:15:00+09:00",
    "categories": ["技術", "TypeScript", "Cloudflare"]
  }
}
```

…本文を書き換えたり、Markdown をプレーンテキストに切り替えたり、投稿日時を今日にずらしたりすることなく。

---

## 開発

```sh
pnpm install
pnpm dev                  # wrangler dev を http://localhost:8787 で起動
pnpm test                 # vitest
pnpm test:coverage        # 全体60%、xml.ts 90%、entries.ts 90% (branch 75%) 以上
pnpm lint                 # biome check
pnpm lint:fix             # biome check --write
pnpm typecheck            # tsc --noEmit
pnpm types:worker         # wrangler.jsonc から Worker 型を再生成
pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry-run  # バンドル確認
```

### ディレクトリ構成

```
src/
  atompub/     — はてな AtomPub API のステートレス HTTP クライアント
  fotolife/    — WSSE 認証 + はてなフォトライフ AtomAPI クライアント
  mcp/
    tools/     — entries.ts, pages.ts, categories.ts, images.ts (ツール群別ファイル)
    server.ts  — createServer() で 13 個のツールを新規 McpServer に登録
    context.ts — リクエストごとの認証情報 + クライアント生成
    response.ts — ToolTextResult、日本語エラー、秘密を除いた構造化ログ
  adapters/cloudflare/
    index.ts   — Hono アプリ: CORS → BYOK 認証 → Streamable HTTP トランスポート
  utils/
    auth.ts    — parseBasicAuth
    body.ts    — リクエスト/レスポンスボディのサイズ制限
    retry.ts   — 冪等メソッド限定の指数バックオフ + jitter、Retry-After を尊重
test/
  fixtures/    — 実 AtomPub レスポンスのサンプル
  ...
```

---

## セキュリティに関する注意

- **このサーバーは `Authorization` をそのまま中継します。** 認証情報はヘッダからデコードされて Worker に届き、各 AtomPub 呼び出しではてな側へ流れます。永続ストレージには書きませんが、それでも信頼できる場所にホストしてください。悪意ある、あるいは乗っ取られた Worker を経由すれば、通過するすべてのキーがログや悪用の対象になり得ます。
- **ログは認証情報・エラーメッセージ・レスポンスボディを意図的に除いています。** `console.*` には操作名、リクエストID、ステータスコード、エラーカテゴリ/型だけを残します。ログを追加するときもこの方針を守ってください。
- **CORS は互換性のためデフォルトで全開放です。** 認証はクッキーではなく `Authorization` で行い、`Access-Control-Allow-Credentials` は付けません。ブラウザクライアントを限定できる環境では `ALLOWED_ORIGINS` の設定を推奨します。設定時はリスト外の明示的な `Origin` を 403 で拒否します。`Origin` のない非ブラウザ要求は許可し、`Host` は別途制限しないため、必要なら前段プロキシでも制約してください。
- **レート制限と濫用対策。** URL を知っている人なら誰でも叩ける公開デプロイは負荷にさらされ得ます。Cloudflare の無料プランにもグローバルな制限はありますが、必要に応じて Wrangler の `[limits]` ブロックや WAF のレート制限ルールを検討してください。
- **API キーが漏洩したら**、*はてなブログ → 設定 → 詳細設定 → AtomPub* から失効・再発行してください。本サーバー側でクリアするものは何もありません。

---

## ライセンス

MIT。フォーク元の著作権表示を含む全文は [LICENSE](./LICENSE) を参照してください。
