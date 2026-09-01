# hatena-blog-mcp

日本語 | [English README](./README.en.md)

[![npm version](https://img.shields.io/npm/v/@kagayoi/hatena-blog-mcp)](https://www.npmjs.com/package/@kagayoi/hatena-blog-mcp)

> [!IMPORTANT]
> このリポジトリは [Keisuke69/hatena-blog-mcp](https://github.com/Keisuke69/hatena-blog-mcp) をフォークし、独自に保守している非公式の派生版です。はてなフォトライフ対応、更新競合の検出、入力・レスポンス上限、ローカルstdio対応など、フォーク固有の変更を含みます。これらの変更に関するIssueは[このフォーク](https://github.com/1llum1n4t1s/KG.hatena-blog-mcp/issues)へ報告してください。変更内容は [CHANGELOG.md](./CHANGELOG.md) にまとめています。

[はてなブログ AtomPub API](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom) と [はてなフォトライフ Atom API](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom/) を読み書きする、ローカル実行型のMCP (Model Context Protocol) サーバーです。Node.js上でstdio通信し、外部のMCPホスティングや中継サービスは必要ありません。

## 特徴

- エントリ、固定ページ、カテゴリ、フォトライフ画像を扱う全13ツール
- `update_entry` / `update_page` の安全な部分更新と `expected_edited` による競合検出
- `eyecatch_image_url` を使った本文先頭画像による自動アイキャッチ
- POSTを自動再試行せず、記事や画像の重複作成を防止
- XML、本文、カテゴリ、画像、エラーボディに上限を設けた防御的な実装
- 認証情報をコマンドライン引数へ置かず、ローカルプロセスの環境変数からのみ取得

## クイックスタート

### 前提条件

- Node.js 22以上
- はてなID
- はてなブログの「設定 → 詳細設定 → AtomPub」に表示されるAPIキー

stdio対応MCPクライアントへ次のように登録します。

```jsonc
{
  "mcpServers": {
    "hatena-blog": {
      "command": "npx",
      "args": ["--yes", "@kagayoi/hatena-blog-mcp@latest"],
      "env": {
        "HATENA_ID": "your-hatena-id",
        "HATENA_API_KEY": "your-atompub-api-key"
      }
    }
  }
}
```

Windowsでクライアントが `npx` を見つけられない場合は、`command` を `npx.cmd` にします。認証情報の設定方法はクライアントごとに異なるため、利用できる場合はクライアントやOSのシークレット管理機能を優先してください。

### 最新版の取得

`@latest` を指定すると、MCPプロセスの起動時にnpmの `latest` dist-tagを解決します。MCP自身が実行中にファイルを書き換えたり、独自の更新サーバーへ問い合わせたりはしません。再現性を優先する場合は、`latest` を実際に利用するリリースversionへ置き換えて固定できます。

### ソースから起動

```sh
git clone https://github.com/1llum1n4t1s/KG.hatena-blog-mcp.git
cd KG.hatena-blog-mcp
pnpm install --frozen-lockfile
pnpm build
```

クライアント設定では `command` を `node`、`args` をclone先の `dist/cli.js` の絶対パスにし、同じ2つの環境変数を渡します。

## 認証とデータフロー

起動時に `HATENA_ID` と `HATENA_API_KEY` からBasic認証ヘッダをメモリ上で生成し、AtomPub APIへ送ります。フォトライフでは同じ認証情報からリクエストごとにWSSEヘッダを生成します。認証情報、記事、画像をディスクへ保存する機能はありません。

`blog_id` はブログのドメイン名です。例: `example.hatenablog.com`、`example.hateblo.jp`。グループブログでは各ツールの任意引数 `hatena_id` でURL上のはてなIDだけを上書きできます。

## ツールリファレンス

### エントリ

| 名前 | 用途 | 必須 | 主なオプション |
| --- | --- | --- | --- |
| `list_entries` | エントリ一覧（1ページ7件） | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_entry` | エントリを1件取得 | `blog_id`, `entry_id` | `hatena_id`, `include_html` |
| `create_entry` | 新規投稿 | `blog_id`, `title`, `content` | `content_type`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `scheduled`, `updated`, `custom_url` |
| `update_entry` | 既存エントリを部分更新 | `blog_id`, `entry_id` | `title`, `content`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_entry` | エントリを削除 | `blog_id`, `entry_id` | `hatena_id` |

`update_entry` は現在値を取得してから指定値をマージします。未指定のタイトル、本文、記法、公開状態、カテゴリ、投稿日時、スラッグは維持されます。カテゴリだけを消す場合は `categories: []` を渡します。`expected_edited` が現在値と異なる場合はPUTせず、競合エラーにします。

`scheduled: true` の新規投稿には `draft: true` と公開日時 `updated` の両方が必要です。HatenaのGETレスポンスに `scheduled` がない場合は結果と更新XMLでも省略し、予約なしを示す `false` を補いません。更新時に投稿日時を変更するのは `touch_updated: true` を指定した場合だけです。

#### 本文先頭画像による自動アイキャッチ

`create_entry` または `update_entry` に `eyecatch_image_url` を指定すると、そのHTTP(S)画像を識別用コメント付きのHTMLブロックとして本文先頭へ挿入します。はてなブログが本文中の最初の画像を自動採用する仕組みを利用するもので、編集画面の公式アイキャッチ項目を直接設定する機能ではありません。画像は記事本文にも表示されます。

```json
{
  "name": "create_entry",
  "arguments": {
    "blog_id": "example.hatenablog.com",
    "title": "自動アイキャッチ付きの記事",
    "content": "### 本文\n\nここから記事本文です。",
    "content_type": "text/x-markdown",
    "eyecatch_image_url": "https://cdn-ak.f.st-hatena.com/images/fotolife/example.png"
  }
}
```

- `upload_image` が返す `image_url` をそのまま利用できます。
- 省略した場合は本文を変更しません。
- 再指定時は、このMCPが以前追加したブロックを置換して重複を防ぎます。
- `update_entry` で本文を省略した場合は既存本文へ適用します。

### 固定ページ

| 名前 | 用途 | 必須 | 主なオプション |
| --- | --- | --- | --- |
| `list_pages` | 固定ページ一覧（1ページ10件） | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_page` | 固定ページを1件取得 | `blog_id`, `page_id` | `hatena_id`, `include_html` |
| `create_page` | 固定ページを作成 | `blog_id`, `title`, `content`, `custom_url` | `content_type`, `draft`, `preview`, `updated` |
| `update_page` | 固定ページを部分更新 | `blog_id`, `page_id` | `title`, `content`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_page` | 固定ページを削除 | `blog_id`, `page_id` | `hatena_id` |

### カテゴリと画像

| 名前 | 用途 | 必須 | 主なオプション |
| --- | --- | --- | --- |
| `list_categories` | カテゴリ一覧と固定状態を取得 | `blog_id` | `hatena_id` |
| `get_image` | フォトライフ画像メタデータを取得 | `image_id` | — |
| `upload_image` | 画像を投稿し、記事用記法とURLを返す | `title`, `content_type`, `data_base64` | `folder`（既定: `Hatena Blog`） |

フォトライフ公式feedはブログ編集画面から投稿した非公開「Hatena Blog」フォルダを列挙しないため、画像一覧ツールは提供していません。

## 上限と再試行

- はてなから受け取るXML: 8 MiB
- エラーボディ: 16 KiB
- 記事本文: 4 MiB
- デコード後の画像: 10 MiB
- カテゴリ: 100件、各256文字
- 上流API timeout: 1回の試行につき30秒
- 自動再試行: GET / PUT / DELETEなどの冪等メソッドのみ。POSTは再試行しません。

## 開発と検証

```sh
pnpm install --frozen-lockfile
pnpm verify
npm pack --dry-run --json
```

`pnpm verify` はBiome、TypeScript、coverage付きVitest、build済みCLIへのstdio接続を実行します。詳しい構造と不変条件は [DESIGN.md](./DESIGN.md) を参照してください。

## セキュリティ

- MCPクライアント設定やラッパーを第三者と共有するときは、環境変数の値を除去してください。
- ログにはAuthorization、APIキー、上流レスポンス本文、任意の例外メッセージを出しません。
- APIキーが漏れた場合は、はてなブログのAtomPub設定から再発行してください。
- 公開HTTPサーバーではなくローカルstdioプロセスですが、同じユーザー権限で動く他プロセスからの環境・設定ファイルの読み取りにはOS側の保護が必要です。

## License

MIT © Keisuke Nishitani
