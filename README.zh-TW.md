# hatena-blog-mcp

[English](./README.md) | [日本語](./README.ja.md) | [简体中文](./README.zh-CN.md) | **繁體中文** | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/@kagayoi/hatena-blog-mcp)](https://www.npmjs.com/package/@kagayoi/hatena-blog-mcp)

> [!IMPORTANT]
> 本儲存庫是 [Keisuke69/hatena-blog-mcp](https://github.com/Keisuke69/hatena-blog-mcp) 的非官方、獨立維護的分支。本分支特有的變更包括：支援 Hatena Fotolife、更新衝突偵測、防禦性大小限制，以及本機 stdio 執行環境。與這些變更相關的問題，請回報至[本分支](https://github.com/1llum1n4t1s/KG.hatena-blog-mcp/issues)。詳情請參閱 [CHANGELOG.md](./CHANGELOG.md)。

這是一個本機 MCP（Model Context Protocol）伺服器，用於讀取與寫入 [Hatena Blog AtomPub API](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom) 與 [Hatena Fotolife Atom API](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom/)。它在 Node.js 上透過 stdio 通訊，不需要外部代管的 MCP 端點或中繼服務。

## 功能

- 13 個工具，涵蓋文章、頁面、分類與 Fotolife 圖片
- `update_entry` 與 `update_page` 支援安全的部分更新，並透過 `expected_edited` 偵測衝突
- 透過選用的「內文首圖區塊」自動選擇代表圖片（eyecatch）
- POST 不會自動重試，以避免重複發佈文章或重複上傳圖片
- 對 XML、內容、分類、圖片與錯誤回應本文設定防禦性限制
- 憑證來自本機行程的環境變數，絕不透過命令列引數傳遞

## 快速開始

### 系統需求

- Node.js 22 或更新版本
- 你的 Hatena ID
- 在 Hatena Blog → 設定 → 進階設定 → AtomPub 中顯示的 API 金鑰

在任何支援 stdio 的 MCP 用戶端中註冊此伺服器：

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

如果 Windows 用戶端找不到 `npx`，請改用 `npx.cmd`。若用戶端或作業系統提供密鑰儲存功能，建議優先使用，而不要把憑證直接寫在共用的設定檔中。

### 更新

`@latest` 會在 MCP 行程啟動時解析為 npm 的 `latest` dist-tag。MCP 在執行期間不會自行改寫，也不會連線至任何自訂的更新服務。若需要可重現的安裝，請將 `latest` 替換為你打算使用的確切發行版本號。

如果你已經以固定版本註冊了此伺服器（例如 `@kagayoi/hatena-blog-mcp@1.0.6`），請將該註冊項中的套件引數改為 `@kagayoi/hatena-blog-mcp@latest`。更新本 README 不會改變既有的註冊項，但完成上述修改後，每次啟動都會自動使用最新發行版本。

### 從原始碼執行

```sh
git clone https://github.com/1llum1n4t1s/KG.hatena-blog-mcp.git
cd KG.hatena-blog-mcp
pnpm install --frozen-lockfile
pnpm build
```

將用戶端指令設為 `node`，傳入 `dist/cli.js` 的絕對路徑，並提供相同的兩個環境變數。

## 驗證與資料流

啟動時，行程會根據 `HATENA_ID` 與 `HATENA_API_KEY` 在記憶體中為 AtomPub 產生 Basic Authorization 標頭。Fotolife 請求則使用同一組憑證為每次請求產生新的 WSSE 標頭。伺服器不會持久保存憑證、文章或圖片。

`blog_id` 是部落格網域，例如 `example.hatenablog.com` 或 `example.hateblo.jp`。對於群組部落格，選用的工具引數 `hatena_id` 只會覆寫上游 URL 中使用的 Hatena ID。

## 工具參考

### 文章

| 工具 | 用途 | 必填 | 主要選項 |
| --- | --- | --- | --- |
| `list_entries` | 列出文章，每頁 7 篇 | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_entry` | 取得單篇文章 | `blog_id`, `entry_id` | `hatena_id`, `include_html` |
| `create_entry` | 建立文章 | `blog_id`, `title`, `content` | `content_type`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `scheduled`, `updated`, `custom_url` |
| `update_entry` | 部分更新文章 | `blog_id`, `entry_id` | `title`, `content`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_entry` | 刪除文章 | `blog_id`, `entry_id` | `hatena_id` |

`update_entry` 會先取得目前的文章，並僅合併明確提供的欄位。未提供的標題、內文、內容類型、發佈狀態、分類、時間戳記與 slug 都會被保留。傳入 `categories: []` 可清空分類。如果 `expected_edited` 與目前的值不一致，此工具會在送出 PUT 之前中止並回報衝突。

新增排程發佈的文章，需要同時滿足 `scheduled: true`、`draft: true`，並提供 `updated` 發佈時間戳記。當 Hatena 在 GET 回應中省略 `scheduled` 時，該欄位在結果與更新 XML 中同樣會被省略，而不會被合成為 `false`。既有的發佈時間戳記僅在指定 `touch_updated: true` 時才會變更。

#### 依內文首圖自動設定代表圖片

向 `create_entry` 或 `update_entry` 傳入 `eyecatch_image_url` 時，MCP 會在內文開頭插入一個可辨識的 HTML 圖片區塊。如此一來，Hatena Blog 就能自動選取內文首圖作為代表圖片。這並不會直接設定 Hatena 官方的代表圖片欄位，且該圖片仍會顯示在文章內文中。

```json
{
  "name": "create_entry",
  "arguments": {
    "blog_id": "example.hatenablog.com",
    "title": "自動設定代表圖片的文章",
    "content": "### 內文\n\n文章從這裡開始。",
    "content_type": "text/x-markdown",
    "eyecatch_image_url": "https://cdn-ak.f.st-hatena.com/images/fotolife/example.png"
  }
}
```

- 可以直接傳入 `upload_image` 回傳的 `image_url`。
- 省略此選項時，內文維持不變。
- 再次提供此選項時，會取代先前由本 MCP 插入的圖片區塊。
- 更新時若省略 `content`，則該圖片區塊會套用至現有內文。

### 頁面

| 工具 | 用途 | 必填 | 主要選項 |
| --- | --- | --- | --- |
| `list_pages` | 列出頁面，每頁 10 個 | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_page` | 取得單一頁面 | `blog_id`, `page_id` | `hatena_id`, `include_html` |
| `create_page` | 建立頁面 | `blog_id`, `title`, `content`, `custom_url` | `content_type`, `draft`, `preview`, `updated` |
| `update_page` | 部分更新頁面 | `blog_id`, `page_id` | `title`, `content`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_page` | 刪除頁面 | `blog_id`, `page_id` | `hatena_id` |

### 分類與圖片

| 工具 | 用途 | 必填 | 主要選項 |
| --- | --- | --- | --- |
| `list_categories` | 列出分類及其固定狀態 | `blog_id` | `hatena_id` |
| `get_image` | 取得 Fotolife 圖片中繼資料 | `image_id` | — |
| `upload_image` | 上傳圖片並回傳其 URL 與部落格語法 | `title`, `content_type`, `data_base64` | `folder`（預設值：`Hatena Blog`） |

官方 Fotolife feed 不會列出透過部落格編輯器寫入的私人「Hatena Blog」資料夾，因此本伺服器不提供圖片清單工具。

## 限制與重試

- Hatena XML 回應：8 MiB
- 錯誤回應本文：16 KiB
- 文章內文：4 MiB
- 解碼後的圖片：10 MiB
- 分類：最多 100 個，每個最長 256 個字元
- 上游逾時：每次嘗試 30 秒
- 自動重試：僅限 GET、PUT、DELETE 等冪等方法；絕不重試 POST
- MCP 請求取消會傳遞至上游請求與重試等待。已經送出的寫入無法復原。
- 回應本文逾時與連線失敗會以網路錯誤回報，與回應本文過大及 XML 解析錯誤分開處理。

## 開發與驗證

```sh
pnpm install --frozen-lockfile
pnpm verify
npm pack --dry-run --json
```

`pnpm verify` 會執行 Biome、TypeScript、啟用覆蓋率的 Vitest、針對建置後 CLI 的 stdio 連線測試，以及涵蓋圖片限制、取消、部分更新與回應本文失敗的 E2E 檢查。建置完成後，執行 `node scripts/smoke-behavior.mjs --report <output.json>` 即可儲存結果。架構與不變條件請參閱 [DESIGN.md](./DESIGN.md)。

## 安全性

- 在分享 MCP 用戶端設定或包裝腳本之前，請先移除其中的環境變數值。
- 日誌不包含 Authorization、API 金鑰、上游回應本文，以及任意例外訊息。
- 如果金鑰外洩，請在 Hatena Blog 的 AtomPub 設定中重新產生金鑰。
- 這是一個本機 stdio 行程，但仍需要作業系統層級的保護，以防範以相同使用者身分執行的其他行程，以及用戶端設定檔的外洩。

## 授權

MIT © Keisuke Nishitani
