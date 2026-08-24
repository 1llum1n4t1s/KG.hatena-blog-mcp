import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FotolifeClient } from "../../fotolife/client.js";
import type { FotolifeContentType, FotolifeImage } from "../../fotolife/types.js";
import {
  MAX_IDENTIFIER_CHARS,
  MAX_IMAGE_BASE64_CHARS,
  MAX_TITLE_CHARS,
} from "../../utils/limits.js";
import type { ToolContext } from "../context.js";
import { ok, type ToolTextResult, toolError } from "../response.js";

const imageContentType = z.enum([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
]);

interface UploadImageArgs {
  title: string;
  content_type: FotolifeContentType;
  data_base64: string;
  folder?: string | undefined;
}

interface GetImageArgs {
  image_id: string;
}

function makeFotolifeClient(ctx: ToolContext): FotolifeClient {
  const options: ConstructorParameters<typeof FotolifeClient>[0] = {
    credentials: ctx.credentials,
  };
  if (ctx.fetchImpl) options.fetchImpl = ctx.fetchImpl;
  if (ctx.retry) options.retry = ctx.retry;
  if (ctx.signal) options.signal = ctx.signal;
  if (ctx.requestTimeoutMs !== undefined) options.requestTimeoutMs = ctx.requestTimeoutMs;
  return new FotolifeClient(options);
}

function imageView(image: FotolifeImage): Record<string, unknown> {
  return {
    id: image.id,
    title: image.title,
    syntax: image.syntax,
    blog_syntax: image.blogSyntax,
    image_url: image.imageUrl,
    ...(image.imageUrlSmall !== undefined ? { image_url_small: image.imageUrlSmall } : {}),
    ...(image.pageUrl !== undefined ? { page_url: image.pageUrl } : {}),
    ...(image.editUrl !== undefined ? { edit_url: image.editUrl } : {}),
    ...(image.folder !== undefined ? { folder: image.folder } : {}),
    ...(image.issued !== undefined ? { issued: image.issued } : {}),
  };
}

export async function getImageHandler(
  args: GetImageArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    const image = await makeFotolifeClient(ctx).getImage(args.image_id);
    return ok(imageView(image));
  } catch (err) {
    return toolError(err, { operation: "get_image", requestId: ctx.requestId });
  }
}

export async function uploadImageHandler(
  args: UploadImageArgs,
  ctx: ToolContext,
): Promise<ToolTextResult> {
  try {
    const image = await makeFotolifeClient(ctx).uploadImage({
      title: args.title,
      contentType: args.content_type,
      dataBase64: args.data_base64,
      ...(args.folder !== undefined ? { folder: args.folder } : {}),
    });
    return ok(imageView(image));
  } catch (err) {
    return toolError(err, { operation: "upload_image", requestId: ctx.requestId });
  }
}

export function registerImageTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_image",
    {
      description: "はてなフォトライフの画像メタデータを1件取得します。",
      inputSchema: {
        image_id: z
          .string()
          .min(1)
          .max(MAX_IDENTIFIER_CHARS)
          .describe("fotolife画像ID。末尾のp/j/g付き記法も指定できます"),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => getImageHandler(args, ctx),
  );

  server.registerTool(
    "upload_image",
    {
      description:
        "画像をはてなフォトライフへ投稿し、記事へ貼り付けられるblog_syntaxと画像URLを返します。",
      inputSchema: {
        title: z.string().min(1).max(MAX_TITLE_CHARS),
        content_type: imageContentType,
        data_base64: z
          .string()
          .min(1)
          .max(MAX_IMAGE_BASE64_CHARS)
          .describe("画像ファイル本体のbase64文字列 (最大10 MiB)"),
        folder: z.string().min(1).max(MAX_TITLE_CHARS).optional().describe("省略時は Hatena Blog"),
      },
    },
    (args) => uploadImageHandler(args, ctx),
  );
}
