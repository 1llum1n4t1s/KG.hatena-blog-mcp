import { AtomPubError } from "../atompub/errors.js";
import type { BasicCredentials } from "../utils/auth.js";
import { MAX_XML_RESPONSE_BYTES, readErrorText, readTextWithLimit } from "../utils/body.js";
import { fetchWithRetry, type RetryOptions } from "../utils/retry.js";
import type { FotolifeImage, FotolifeUploadPayload } from "./types.js";
import { buildWsseHeaders } from "./wsse.js";
import { buildFotolifeUploadXml, parseFotolifeImage } from "./xml.js";

const FOTOLIFE_BASE = "https://f.hatena.ne.jp/atom";
const CONTENT_TYPE_XML = "application/x.atom+xml; charset=utf-8";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface FotolifeClientOptions {
  credentials: BasicCredentials;
  fetchImpl?: typeof fetch;
  retry?: RetryOptions;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
}

export class FotolifeClient {
  private readonly credentials: BasicCredentials;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryOptions;
  private readonly signal: AbortSignal | undefined;
  private readonly requestTimeoutMs: number;

  constructor(options: FotolifeClientOptions) {
    this.credentials = options.credentials;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retry = options.retry ?? {};
    this.signal = options.signal;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  async getImage(imageId: string): Promise<FotolifeImage> {
    const normalizedId = normalizeImageId(imageId);
    const xml = await this.requestXml(
      "GET",
      `${FOTOLIFE_BASE}/edit/${encodeURIComponent(normalizedId)}`,
    );
    return parseFotolifeImage(xml);
  }

  async uploadImage(payload: FotolifeUploadPayload): Promise<FotolifeImage> {
    const xml = buildFotolifeUploadXml(payload);
    const responseXml = await this.requestXml("POST", `${FOTOLIFE_BASE}/post`, xml);
    return parseFotolifeImage(responseXml);
  }

  private async requestXml(method: "GET" | "POST", url: string, body?: string): Promise<string> {
    const baseHeaders: Record<string, string> = {
      Accept: "application/x.atom+xml, application/xml, text/xml",
    };
    if (body !== undefined) baseHeaders["Content-Type"] = CONTENT_TYPE_XML;
    const init: RequestInit = {
      method,
      headers: baseHeaders,
      ...(this.signal ? { signal: this.signal } : {}),
      ...(body !== undefined ? { body } : {}),
    };
    const authenticatedFetch: typeof fetch = async (input, attemptInit) => {
      const headers = new Headers(attemptInit?.headers);
      const authHeaders = await buildWsseHeaders(this.credentials);
      for (const [name, value] of Object.entries(authHeaders)) headers.set(name, value);
      return this.fetchImpl(input, { ...attemptInit, headers });
    };

    let response: Response;
    try {
      response = await fetchWithRetry(url, init, {
        ...this.retry,
        attemptTimeoutMs: this.requestTimeoutMs,
        fetchImpl: authenticatedFetch,
      });
    } catch (cause) {
      throw new AtomPubError("Hatena Fotolife network request failed", {
        status: 0,
        code: "network_error",
        cause,
      });
    }
    if (!response.ok) {
      const text = await readErrorText(response);
      throw new AtomPubError(`Hatena Fotolife returned ${response.status}`, {
        status: response.status,
        body: text,
      });
    }
    try {
      return await readTextWithLimit(response, MAX_XML_RESPONSE_BYTES);
    } catch (cause) {
      throw new AtomPubError("Hatena Fotolife response exceeded the XML size limit", {
        status: 0,
        code: "parse_error",
        cause,
      });
    }
  }
}

function normalizeImageId(imageId: string): string {
  const match = /([0-9]{14,})/.exec(imageId);
  if (!match?.[1]) throw new Error("画像IDは14桁以上の数字で指定してください。");
  return match[1];
}
