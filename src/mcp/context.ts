import { AtomPubClient } from "../atompub/client.js";
import type { BasicCredentials } from "../utils/auth.js";
import type { RetryOptions } from "../utils/retry.js";

/**
 * Everything a tool handler needs to talk to Hatena on behalf of the caller.
 *
 * stdioプロセスごとに環境変数から認証情報を設定する。
 * 各ツール要求では、このcontextを複製して要求単位のキャンセルsignalを渡す。
 */
export interface ToolContext {
  credentials: BasicCredentials;
  fetchImpl?: typeof fetch;
  retry?: RetryOptions;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  requestId?: string;
}

/** 共有contextを変更せず、要求と呼び出し元の両方のキャンセルを伝える。 */
export function withRequestSignal(ctx: ToolContext, signal?: AbortSignal): ToolContext {
  if (!signal) return ctx;
  return {
    ...ctx,
    signal: ctx.signal ? AbortSignal.any([ctx.signal, signal]) : signal,
  };
}

/**
 * Builds a scoped AtomPubClient for a specific blog.
 *
 * `hatenaIdOverride` lets a tool call target a blog owned by a different
 * Hatena ID than the credential's username component — only meaningful if
 * the same API key happens to be valid for both accounts (rare but
 * technically possible for group blogs).
 */
export function makeClient(
  ctx: ToolContext,
  blogId: string,
  hatenaIdOverride?: string,
): AtomPubClient {
  const opts: ConstructorParameters<typeof AtomPubClient>[0] = {
    credentials: {
      authHeader: ctx.credentials.authHeader,
      hatenaId: hatenaIdOverride ?? ctx.credentials.hatenaId,
    },
    blogId,
  };
  if (ctx.fetchImpl) opts.fetchImpl = ctx.fetchImpl;
  if (ctx.retry) opts.retry = ctx.retry;
  if (ctx.signal) opts.signal = ctx.signal;
  if (ctx.requestTimeoutMs !== undefined) opts.requestTimeoutMs = ctx.requestTimeoutMs;
  return new AtomPubClient(opts);
}
