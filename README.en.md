# hatena-blog-mcp

[日本語 README](./README.md) | English

[![npm version](https://img.shields.io/npm/v/@kagayoi/hatena-blog-mcp)](https://www.npmjs.com/package/@kagayoi/hatena-blog-mcp)

> [!IMPORTANT]
> This repository is an unofficial, independently maintained fork of [Keisuke69/hatena-blog-mcp](https://github.com/Keisuke69/hatena-blog-mcp). Fork-specific changes include Hatena Fotolife support, update-conflict detection, defensive size limits, and a local stdio runtime. Report issues about these changes to [this fork](https://github.com/1llum1n4t1s/KG.hatena-blog-mcp/issues). See [CHANGELOG.md](./CHANGELOG.md) for details.

A local MCP (Model Context Protocol) server for reading and writing the [Hatena Blog AtomPub API](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom) and [Hatena Fotolife Atom API](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom/). It communicates over stdio on Node.js and does not require an externally hosted MCP endpoint or relay.

## Features

- 13 tools covering entries, pages, categories, and Fotolife images
- Safe partial updates in `update_entry` and `update_page`, with `expected_edited` conflict detection
- Automatic eyecatch selection via an optional first-body-image block
- No automatic retry for POST, avoiding duplicate posts and image uploads
- Defensive limits for XML, content, categories, images, and error bodies
- Credentials come from local process environment variables, never command-line arguments

## Quick start

### Requirements

- Node.js 22 or later
- Your Hatena ID
- The API key shown under Hatena Blog → Settings → Advanced → AtomPub

Register the server in any stdio-capable MCP client:

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

If a Windows client cannot find `npx`, use `npx.cmd`. Prefer the client's or operating system's secret storage when available instead of keeping credentials directly in a shared configuration file.

### Updates

The `@latest` spec resolves npm's `latest` dist-tag when the MCP process starts. The MCP does not rewrite itself or contact a custom update service while running. For reproducible installs, replace `latest` with the exact release version you intend to use.

### Run from source

```sh
git clone https://github.com/1llum1n4t1s/KG.hatena-blog-mcp.git
cd KG.hatena-blog-mcp
pnpm install --frozen-lockfile
pnpm build
```

Set the client command to `node`, pass the absolute path to `dist/cli.js`, and provide the same two environment variables.

## Authentication and data flow

At startup, the process derives an in-memory Basic Authorization header from `HATENA_ID` and `HATENA_API_KEY` for AtomPub. Fotolife requests derive a fresh WSSE header from the same credentials. The server does not persist credentials, posts, or images.

`blog_id` is the blog domain, for example `example.hatenablog.com` or `example.hateblo.jp`. On group blogs, the optional `hatena_id` tool argument overrides only the Hatena ID used in the upstream URL.

## Tool reference

### Entries

| Tool | Purpose | Required | Main options |
| --- | --- | --- | --- |
| `list_entries` | List entries, 7 per page | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_entry` | Get one entry | `blog_id`, `entry_id` | `hatena_id`, `include_html` |
| `create_entry` | Create an entry | `blog_id`, `title`, `content` | `content_type`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `scheduled`, `updated`, `custom_url` |
| `update_entry` | Partially update an entry | `blog_id`, `entry_id` | `title`, `content`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_entry` | Delete an entry | `blog_id`, `entry_id` | `hatena_id` |

`update_entry` fetches the current entry and merges only explicitly supplied fields. It preserves omitted title, body, content type, publication state, categories, timestamp, and slug. Pass `categories: []` to clear categories. If `expected_edited` does not match the current value, the tool stops before PUT and reports a conflict.

A scheduled new entry requires `scheduled: true`, `draft: true`, and an `updated` publication timestamp. When Hatena omits `scheduled` from a GET response, the field is also omitted from the result and update XML instead of being synthesized as `false`. Existing publication timestamps change only with `touch_updated: true`.

#### Automatic eyecatch from the first body image

When `eyecatch_image_url` is supplied to `create_entry` or `update_entry`, the MCP inserts an identifiable HTML image block at the start of the body. Hatena Blog can then select the first body image automatically. This does not set Hatena's official eyecatch field directly, and the image remains visible in the article body.

```json
{
  "name": "create_entry",
  "arguments": {
    "blog_id": "example.hatenablog.com",
    "title": "An entry with an automatic eyecatch",
    "content": "### Body\n\nThe article starts here.",
    "content_type": "text/x-markdown",
    "eyecatch_image_url": "https://cdn-ak.f.st-hatena.com/images/fotolife/example.png"
  }
}
```

- You can pass the `image_url` returned by `upload_image` directly.
- Omitting the option leaves the body unchanged.
- Supplying it again replaces a block previously inserted by this MCP.
- When `content` is omitted during an update, the block is applied to the existing body.

### Pages

| Tool | Purpose | Required | Main options |
| --- | --- | --- | --- |
| `list_pages` | List pages, 10 per page | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_page` | Get one page | `blog_id`, `page_id` | `hatena_id`, `include_html` |
| `create_page` | Create a page | `blog_id`, `title`, `content`, `custom_url` | `content_type`, `draft`, `preview`, `updated` |
| `update_page` | Partially update a page | `blog_id`, `page_id` | `title`, `content`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_page` | Delete a page | `blog_id`, `page_id` | `hatena_id` |

### Categories and images

| Tool | Purpose | Required | Main options |
| --- | --- | --- | --- |
| `list_categories` | List categories and fixed state | `blog_id` | `hatena_id` |
| `get_image` | Get Fotolife image metadata | `image_id` | — |
| `upload_image` | Upload an image and return its URL and blog syntax | `title`, `content_type`, `data_base64` | `folder` (default: `Hatena Blog`) |

The official Fotolife feed does not list the private “Hatena Blog” folder populated through the blog editor, so this server does not provide an image-list tool.

## Limits and retries

- Hatena XML response: 8 MiB
- Error body: 16 KiB
- Entry body: 4 MiB
- Decoded image: 10 MiB
- Categories: 100 entries, 256 characters each
- Upstream timeout: 30 seconds per attempt
- Automatic retry: idempotent methods such as GET, PUT, and DELETE only; never POST

## Development and verification

```sh
pnpm install --frozen-lockfile
pnpm verify
npm pack --dry-run --json
```

`pnpm verify` runs Biome, TypeScript, coverage-enabled Vitest, and a stdio connection against the built CLI. See [DESIGN.md](./DESIGN.md) for architecture and invariants.

## Security

- Remove environment values before sharing an MCP client configuration or wrapper.
- Logs exclude Authorization, API keys, upstream response bodies, and arbitrary exception messages.
- If a key leaks, rotate it from Hatena Blog's AtomPub settings.
- This is a local stdio process, but operating-system protection is still required against other processes running as the same user and against disclosure of client configuration files.

## License

MIT © Keisuke Nishitani
