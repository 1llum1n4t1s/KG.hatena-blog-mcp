# hatena-blog-mcp

[English](./README.md) | [日本語](./README.ja.md) | **简体中文** | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [Português (Brasil)](./README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/@kagayoi/hatena-blog-mcp)](https://www.npmjs.com/package/@kagayoi/hatena-blog-mcp)

> [!IMPORTANT]
> 本仓库是 [Keisuke69/hatena-blog-mcp](https://github.com/Keisuke69/hatena-blog-mcp) 的非官方、独立维护的分支。本分支特有的改动包括：支持 Hatena Fotolife、更新冲突检测、防御性大小限制，以及本地 stdio 运行时。与这些改动相关的问题请提交到[本分支](https://github.com/1llum1n4t1s/KG.hatena-blog-mcp/issues)。详情请参阅 [CHANGELOG.md](./CHANGELOG.md)。

这是一个本地 MCP（Model Context Protocol）服务器，用于读取和写入 [Hatena Blog AtomPub API](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom) 与 [Hatena Fotolife Atom API](https://developer.hatena.ne.jp/ja/documents/fotolife/apis/atom/)。它在 Node.js 上通过 stdio 通信，无需外部托管的 MCP 端点或中继服务。

## 功能

- 13 个工具，涵盖文章、页面、分类和 Fotolife 图片
- `update_entry` 与 `update_page` 支持安全的部分更新，并通过 `expected_edited` 检测冲突
- 通过可选的“正文首图块”自动选择题图（eyecatch）
- POST 不自动重试，避免重复发布文章或重复上传图片
- 对 XML、内容、分类、图片和错误响应体设置防御性限制
- 凭据来自本地进程的环境变量，绝不通过命令行参数传递

## 快速开始

### 环境要求

- Node.js 22 或更高版本
- 你的 Hatena ID
- 在 Hatena Blog → 设置 → 高级设置 → AtomPub 中显示的 API 密钥

在任何支持 stdio 的 MCP 客户端中注册该服务器：

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

如果 Windows 客户端找不到 `npx`，请使用 `npx.cmd`。如有可用的客户端或操作系统密钥存储，建议优先使用，而不要把凭据直接写在共享的配置文件中。

### 更新

`@latest` 会在 MCP 进程启动时解析为 npm 的 `latest` dist-tag。MCP 在运行期间不会自行改写，也不会连接任何自定义的更新服务。若需要可复现的安装，请把 `latest` 替换为你打算使用的确切发布版本号。

如果你已经用固定版本注册了该服务器（例如 `@kagayoi/hatena-blog-mcp@1.0.6`），请把该注册项中的包参数改为 `@kagayoi/hatena-blog-mcp@latest`。更新本 README 不会改变已有的注册项，但完成上述修改后，每次启动都会自动使用最新发布版本。

### 从源码运行

```sh
git clone https://github.com/1llum1n4t1s/KG.hatena-blog-mcp.git
cd KG.hatena-blog-mcp
pnpm install --frozen-lockfile
pnpm build
```

将客户端命令设为 `node`，传入 `dist/cli.js` 的绝对路径，并提供相同的两个环境变量。

## 认证与数据流

启动时，进程会根据 `HATENA_ID` 和 `HATENA_API_KEY` 在内存中为 AtomPub 生成 Basic Authorization 头。Fotolife 请求则使用同一组凭据为每次请求生成新的 WSSE 头。服务器不会持久化保存凭据、文章或图片。

`blog_id` 是博客域名，例如 `example.hatenablog.com` 或 `example.hateblo.jp`。对于群组博客，可选的工具参数 `hatena_id` 仅会覆盖上游 URL 中使用的 Hatena ID。

## 工具参考

### 文章

| 工具 | 用途 | 必填 | 主要选项 |
| --- | --- | --- | --- |
| `list_entries` | 列出文章，每页 7 篇 | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_entry` | 获取单篇文章 | `blog_id`, `entry_id` | `hatena_id`, `include_html` |
| `create_entry` | 创建文章 | `blog_id`, `title`, `content` | `content_type`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `scheduled`, `updated`, `custom_url` |
| `update_entry` | 部分更新文章 | `blog_id`, `entry_id` | `title`, `content`, `eyecatch_image_url`, `categories`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_entry` | 删除文章 | `blog_id`, `entry_id` | `hatena_id` |

`update_entry` 会先获取当前文章，并仅合并显式提供的字段。未提供的标题、正文、内容类型、发布状态、分类、时间戳和 slug 都会被保留。传入 `categories: []` 可清空分类。如果 `expected_edited` 与当前值不一致，该工具会在发送 PUT 之前中止并报告冲突。

新建定时发布的文章需要同时满足 `scheduled: true`、`draft: true`，并提供 `updated` 发布时间戳。当 Hatena 在 GET 响应中省略 `scheduled` 时，该字段在结果和更新 XML 中同样会被省略，而不会被合成为 `false`。已有的发布时间戳仅在指定 `touch_updated: true` 时才会改变。

#### 根据正文首图自动设置题图

向 `create_entry` 或 `update_entry` 传入 `eyecatch_image_url` 时，MCP 会在正文开头插入一个可识别的 HTML 图片块。这样 Hatena Blog 就可以自动选取正文首图作为题图。这并不会直接设置 Hatena 官方的题图字段，且该图片仍会显示在文章正文中。

```json
{
  "name": "create_entry",
  "arguments": {
    "blog_id": "example.hatenablog.com",
    "title": "自动设置题图的文章",
    "content": "### 正文\n\n文章从这里开始。",
    "content_type": "text/x-markdown",
    "eyecatch_image_url": "https://cdn-ak.f.st-hatena.com/images/fotolife/example.png"
  }
}
```

- 可以直接传入 `upload_image` 返回的 `image_url`。
- 省略该选项时，正文保持不变。
- 再次提供该选项时，会替换此前由本 MCP 插入的图片块。
- 更新时若省略 `content`，则该图片块会应用到现有正文上。

### 页面

| 工具 | 用途 | 必填 | 主要选项 |
| --- | --- | --- | --- |
| `list_pages` | 列出页面，每页 10 个 | `blog_id` | `hatena_id`, `page`, `include_html` |
| `get_page` | 获取单个页面 | `blog_id`, `page_id` | `hatena_id`, `include_html` |
| `create_page` | 创建页面 | `blog_id`, `title`, `content`, `custom_url` | `content_type`, `draft`, `preview`, `updated` |
| `update_page` | 部分更新页面 | `blog_id`, `page_id` | `title`, `content`, `draft`, `preview`, `custom_url`, `touch_updated`, `expected_edited` |
| `delete_page` | 删除页面 | `blog_id`, `page_id` | `hatena_id` |

### 分类与图片

| 工具 | 用途 | 必填 | 主要选项 |
| --- | --- | --- | --- |
| `list_categories` | 列出分类及其固定状态 | `blog_id` | `hatena_id` |
| `get_image` | 获取 Fotolife 图片元数据 | `image_id` | — |
| `upload_image` | 上传图片并返回其 URL 与博客语法 | `title`, `content_type`, `data_base64` | `folder`（默认值：`Hatena Blog`） |

官方 Fotolife feed 不会列出通过博客编辑器写入的私有“Hatena Blog”文件夹，因此本服务器不提供图片列表工具。

## 限制与重试

- Hatena XML 响应：8 MiB
- 错误响应体：16 KiB
- 文章正文：4 MiB
- 解码后的图片：10 MiB
- 分类：最多 100 个，每个最长 256 个字符
- 上游超时：每次尝试 30 秒
- 自动重试：仅限 GET、PUT、DELETE 等幂等方法；绝不重试 POST
- MCP 请求取消会传播到上游请求和重试等待。已经发出的写入无法回滚。
- 响应体超时和连接失败会作为网络错误报告，与响应体过大和 XML 解析错误区分开。

## 开发与验证

```sh
pnpm install --frozen-lockfile
pnpm verify
npm pack --dry-run --json
```

`pnpm verify` 会运行 Biome、TypeScript、启用覆盖率的 Vitest、针对构建后 CLI 的 stdio 连接测试，以及覆盖图片限制、取消、部分更新和响应体故障的 E2E 检查。构建完成后，运行 `node scripts/smoke-behavior.mjs --report <output.json>` 即可保存结果。架构与不变量请参阅 [DESIGN.md](./DESIGN.md)。

## 安全

- 在分享 MCP 客户端配置或封装脚本之前，请先移除其中的环境变量值。
- 日志不包含 Authorization、API 密钥、上游响应体以及任意异常消息。
- 如果密钥泄露，请在 Hatena Blog 的 AtomPub 设置中轮换密钥。
- 这是一个本地 stdio 进程，但仍需要操作系统层面的保护，以防范以同一用户身份运行的其他进程，以及客户端配置文件的泄露。

## 许可证

MIT © Keisuke Nishitani
