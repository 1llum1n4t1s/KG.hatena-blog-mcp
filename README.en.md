# hatena-blog-mcp

[日本語 README](./README.md) | English

An MCP (Model Context Protocol) server that wraps the [Hatena Blog AtomPub API](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom) and [Hatena Fotolife Atom API](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom/) with **read and write** support, designed to run on **Cloudflare Workers** with a **BYOK (Bring Your Own Key)** model.

Built for the canonical use case of asking Claude to bulk re-tag categories across every entry in a blog — without accidentally rewriting titles, bodies, or publish dates along the way.

## Features

- Entries: `list_entries`, `get_entry`, `create_entry`, `update_entry`, `delete_entry`
- Pages: `list_pages`, `get_page`, `create_page`, `update_page`, `delete_page`
- Categories: `list_categories`
- Images: `get_image`, `upload_image`
- **Safe partial updates**: `update_entry` / `update_page` keep existing title, body, syntax, publish date, and slug unless you explicitly change them. The body's `content_type` is always taken from the existing entry so Markdown never silently flips to plain text.
- Zero state on the server — credentials live only in the `Authorization` header of each request.

## Transport

- **MCP Streamable HTTP** only (`POST /mcp`, JSON response mode)
- No stdio — use [`mcp-remote`](https://github.com/geelen/mcp-remote) if your client can only speak stdio
- No SSE

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/mcp` | MCP Streamable HTTP entry point |
| `OPTIONS` | `/mcp` | CORS preflight |
| `GET` | `/` | Health / identification JSON |

---

## Quick start: Deploy to Cloudflare Workers

```sh
pnpm install
pnpm exec wrangler login
pnpm exec wrangler deploy
```

That's it. No secrets, no KV, no Durable Objects — clients supply credentials on each request. Your URL will look like `https://hatena-blog-mcp.<your-subdomain>.workers.dev`.

### Optional Wrangler variable

| Variable | Default | Description |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | empty → `*` | Comma-separated CORS allowlist (e.g. `https://claude.ai,https://chatgpt.com`). When non-empty, an explicit unlisted `Origin` is rejected with 403, including preflights. Empty preserves compatibility with a broad range of MCP clients. |

Edit `vars` in `wrangler.jsonc`, then deploy normally. A command-line-only `--var` is intentionally avoided because the next plain deploy would remove it.

```jsonc
"vars": {
  "ALLOWED_ORIGINS": "https://claude.ai,https://chatgpt.com"
}
```

---

## Authentication (BYOK)

This server stores **no credentials**. Every request must carry:

```
Authorization: Basic base64(hatena_id:api_key)
```

Get your API key from **Hatena Blog → Settings → Advanced → AtomPub**. The Hatena ID is the left side of your blog URL (`<hatena_id>.hatenablog.com`).

The same deployed Worker can be shared by multiple users — each supplies their own key.

---

## Client setup

### Claude Desktop / Claude.ai Web / mobile (native remote MCP)

Add a new remote MCP server and point it at your Worker URL:

- **URL**: `https://hatena-blog-mcp.<your-subdomain>.workers.dev/mcp`
- **Auth**: Basic, username = your Hatena ID, password = your AtomPub API key

### Claude Code (or any stdio-only client) via `mcp-remote`

`mcp-remote` bridges stdio → Streamable HTTP locally:

```jsonc
// ~/.claude.json or the equivalent per-client config
{
  "mcpServers": {
    "hatena-blog": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://hatena-blog-mcp.<your-subdomain>.workers.dev/mcp",
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

Generate the base64 value with `printf '%s' 'hatena_id:api_key' | base64`.

### MCP Inspector (for quick manual testing)

```sh
pnpm exec wrangler dev  # in one terminal
npx @modelcontextprotocol/inspector
```

In the inspector, choose **Streamable HTTP**, URL `http://localhost:8787/mcp`, and set a custom header `Authorization: Basic <base64>`.

---

## Tool reference

Blog entry, page, and category tools take a required `blog_id` (e.g. `example.hatenablog.com`) and an optional `hatena_id` override. Image tools operate on the Fotolife account tied to the Authorization header, so they do not take `blog_id`.

### Entries

| Name | Purpose | Required | Key options |
| --- | --- | --- | --- |
| `list_entries` | List entries (7 per page) | `blog_id` | `page`, `include_html` |
| `get_entry` | Fetch one entry | `blog_id`, `entry_id` | `include_html` |
| `create_entry` | Post a new entry | `blog_id`, `title`, `content` | `content_type`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `scheduled` (`true` requires `draft: true` + `updated`), `custom_url` |
| `update_entry` | **Partial update** | `blog_id`, `entry_id` | `title`, `content`, `eyecatch_image_url`, `categories` (`[]` to clear), `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_entry` | Delete an entry | `blog_id`, `entry_id` | — |

`update_entry` semantics:
- Any field you omit is kept from the existing entry.
- `content_type` is **always** taken from the existing entry — you cannot change Markdown ↔ plain text via this tool.
- `updated` is only sent when `touch_updated: true` (default: keep the original publish date).
- `custom_url` is only sent when you specify it (default: keep the existing slug).
- Pass the preceding result's `edited` as `expected_edited` to reject the PUT if that fetched version is already stale. Hatena exposes no conditional PUT, so this is not an atomic guarantee across the server-side GET-to-PUT interval.

#### Automatic eyecatch from a lead image

Pass the optional `eyecatch_image_url` to `create_entry` or `update_entry` to insert that HTTP(S) image at the start of the article body. This uses Hatena Blog's fallback that automatically selects the first body image; it does not write Hatena's official eyecatch field. The image is also visible in the article body.

```json
{
  "name": "create_entry",
  "arguments": {
    "blog_id": "example.hatenablog.com",
    "title": "An article with an automatic eyecatch",
    "content": "### Body\n\nThe article starts here.",
    "content_type": "text/x-markdown",
    "eyecatch_image_url": "https://cdn-ak.f.st-hatena.com/images/fotolife/example.png"
  }
}
```

- You can pass the `image_url` returned by `upload_image` directly to `eyecatch_image_url`.
- Omitting the option leaves the body unchanged.
- When `update_entry` omits `content`, the image is added to the existing body. If this MCP previously inserted an automatic-eyecatch block, it is replaced to avoid duplicates.
- The 4 MiB body limit is checked after insertion.

### Pages

Same shape as entries minus `categories` / `scheduled`. `create_page` requires `custom_url` (Hatena treats it as the page's permanent slug). `update_page` also accepts `expected_edited` for conflict detection.

### Categories

- `list_categories` → `{ categories: string[], fixed: boolean }`. `fixed: true` means new categories can't be added to this blog.

### Images (Hatena Fotolife)

| Name | Purpose | Required | Key options |
| --- | --- | --- | --- |
| `get_image` | Fetch one image's metadata | `image_id` | — |
| `upload_image` | Upload an image and return article-ready `blog_syntax` | `title`, `content_type`, `data_base64` | `folder` (default: `Hatena Blog`) |

Image operations derive a per-request WSSE header from the caller's Basic credentials; the API key is never stored server-side. `upload_image` POSTs are not retried automatically, preventing duplicate uploads.

Decoded images are limited to 10 MiB. MCP requests are limited to 16 MiB, Hatena XML responses to 8 MiB, and upstream error bodies to 16 KiB.

The official Fotolife feed does not enumerate images in the private `Hatena Blog` folder used by the blog editor, so this server intentionally omits a list tool. Extract image IDs from an entry's Fotolife syntax and inspect them with `get_image`.

---

## Example: bulk category re-tagging (the original motivation)

Once the MCP server is connected, ask Claude something like:

> "私のブログ `example.hatenablog.com` の全エントリを `list_entries` で列挙して、各エントリの本文を読んだうえで既存カテゴリを整理し直してください。タイトル・本文・投稿日時は絶対に変更しないでください。"

Because `update_entry` fetches and merges existing values, Claude can pass the intended change plus the `edited` value it just observed:

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

…without rewriting the body, flipping Markdown to plain text, or nudging the publish date to today.

---

## Development

```sh
pnpm install
pnpm dev                  # wrangler dev on http://localhost:8787
pnpm test                 # vitest
pnpm test:coverage        # overall 60%, xml.ts 90%, entries.ts 90% (75% branches)
pnpm lint                 # biome check
pnpm lint:fix             # biome check --write
pnpm typecheck            # tsc --noEmit
pnpm types:worker         # regenerate Worker types from wrangler.jsonc
pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry-run  # bundle check
```

### Layout

```
src/
  atompub/     — stateless HTTP client for the Hatena AtomPub API
  fotolife/    — WSSE auth + Hatena Fotolife Atom API client
  mcp/
    tools/     — entries.ts, pages.ts, categories.ts, images.ts (one tool group per file)
    server.ts  — createServer() registers all 13 tools onto a fresh McpServer
    context.ts — per-request credentials + client factory
    response.ts — ToolTextResult, Japanese error mapping, sanitised structured logs
  adapters/cloudflare/
    index.ts   — Hono app: CORS → BYOK auth → Streamable HTTP transport
  utils/
    auth.ts    — parseBasicAuth
    body.ts    — bounded request/response body readers
    retry.ts   — idempotent-method-only backoff + jitter, honours Retry-After
test/
  fixtures/    — real AtomPub response samples
  ...
```

---

## Security notes

- **This server relays `Authorization` verbatim.** Credentials reach the Worker decoded from the header, then flow through to Hatena on each AtomPub call. They are never written to any durable storage, but you should still host this somewhere you trust. A malicious or compromised Worker could log or misuse every key that passes through it.
- **Logs intentionally omit credentials, error messages, and response bodies.** Only the operation, request ID, status, error category, and error type reach `console.*`. If you add logging, keep it that way.
- **CORS is wide open by default for compatibility.** Authentication uses `Authorization`, not cookies, and `Access-Control-Allow-Credentials` is never set. Configure `ALLOWED_ORIGINS` when browser clients can be enumerated; explicit unlisted Origins then receive 403. Non-browser requests without `Origin` remain allowed, and `Host` is not separately restricted, so enforce that at a front proxy if needed.
- **Rate limits and abuse.** A public deployment can be hammered by anyone who knows the URL. Cloudflare's free plan already enforces global limits, but consider Wrangler's `[limits]` block and a WAF rate-limit rule if this becomes a problem.
- **If an API key leaks**, revoke it from *Hatena Blog → Settings → Advanced → AtomPub* and rotate. This server has nothing to purge.

---

## License

MIT © Keisuke Nishitani
