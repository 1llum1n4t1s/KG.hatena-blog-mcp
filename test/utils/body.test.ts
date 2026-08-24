import { describe, expect, it } from "vitest";
import {
  ResponseBodyTooLargeError,
  readBytesWithLimit,
  readErrorText,
  readTextWithLimit,
} from "../../src/utils/body.js";

describe("bounded response bodies", () => {
  it("rejects an oversized Content-Length before reading", async () => {
    const response = new Response("small", { headers: { "Content-Length": "100" } });
    await expect(readTextWithLimit(response, 10)).rejects.toBeInstanceOf(ResponseBodyTooLargeError);
  });

  it("rejects a chunked body once its byte limit is exceeded", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5, 6]));
          controller.close();
        },
      }),
    );
    await expect(readTextWithLimit(response, 5)).rejects.toBeInstanceOf(ResponseBodyTooLargeError);
  });

  it("returns a bounded byte stream without text expansion", async () => {
    const body = new Blob([new Uint8Array([1, 2, 3])]).stream();
    await expect(readBytesWithLimit(body, 3)).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("drops oversized error bodies instead of retaining them", async () => {
    const response = new Response("error", { headers: { "Content-Length": "999999" } });
    await expect(readErrorText(response)).resolves.toBe("");
  });
});
