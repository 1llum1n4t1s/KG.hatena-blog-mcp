export const MAX_XML_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_ERROR_RESPONSE_BYTES = 16 * 1024;

export class ResponseBodyTooLargeError extends Error {
  constructor(
    readonly maxBytes: number,
    readonly actualBytes?: number,
  ) {
    super(
      actualBytes === undefined
        ? `Response body exceeded ${maxBytes} bytes`
        : `Response body is ${actualBytes} bytes (limit: ${maxBytes})`,
    );
    this.name = "ResponseBodyTooLargeError";
  }
}

export async function readBytesWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!body) return new Uint8Array();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new ResponseBodyTooLargeError(maxBytes, totalBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsed) && parsed > maxBytes) {
      await response.body?.cancel();
      throw new ResponseBodyTooLargeError(maxBytes, parsed);
    }
  }

  const bytes = await readBytesWithLimit(response.body, maxBytes);
  return new TextDecoder().decode(bytes);
}

export async function readErrorText(response: Response): Promise<string> {
  try {
    return await readTextWithLimit(response, MAX_ERROR_RESPONSE_BYTES);
  } catch {
    return "";
  }
}
