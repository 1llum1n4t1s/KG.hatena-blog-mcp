import { describe, expect, it } from "vitest";
import { fetchWithRetry } from "../../src/utils/retry.js";

function makeResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response("body", { status, headers });
}

interface Recorder {
  calls: number;
  waits: number[];
}

function makeDeps(recorder: Recorder) {
  return {
    random: () => 0.5, // no jitter
    sleep: async (ms: number) => {
      recorder.waits.push(ms);
    },
    now: () => 0,
  };
}

describe("fetchWithRetry", () => {
  it("returns the first 2xx response without retrying", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      return makeResponse(200);
    };
    const res = await fetchWithRetry("https://x", {}, { ...makeDeps(rec), fetchImpl });
    expect(res.status).toBe(200);
    expect(rec.calls).toBe(1);
    expect(rec.waits).toEqual([]);
  });

  it("does not retry non-retryable 4xx statuses", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      return makeResponse(401);
    };
    const res = await fetchWithRetry("https://x", {}, { ...makeDeps(rec), fetchImpl });
    expect(res.status).toBe(401);
    expect(rec.calls).toBe(1);
  });

  it("retries 429 up to maxRetries with exponential backoff", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      return makeResponse(429);
    };
    const res = await fetchWithRetry(
      "https://x",
      {},
      { ...makeDeps(rec), fetchImpl, maxRetries: 3, baseDelayMs: 1000, factor: 2 },
    );
    expect(res.status).toBe(429);
    // Attempt 0 → wait 1000, attempt 1 → 2000, attempt 2 → 4000, attempt 3 → give up
    expect(rec.calls).toBe(4);
    expect(rec.waits).toEqual([1000, 2000, 4000]);
  });

  it("retries 503 and eventually succeeds", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      return rec.calls < 3 ? makeResponse(503) : makeResponse(200);
    };
    const res = await fetchWithRetry(
      "https://x",
      {},
      { ...makeDeps(rec), fetchImpl, baseDelayMs: 100, factor: 2 },
    );
    expect(res.status).toBe(200);
    expect(rec.calls).toBe(3);
    expect(rec.waits).toEqual([100, 200]);
  });

  it("honours Retry-After: seconds over the computed backoff", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      return rec.calls < 2 ? makeResponse(429, { "Retry-After": "7" }) : makeResponse(200);
    };
    await fetchWithRetry("https://x", {}, { ...makeDeps(rec), fetchImpl, baseDelayMs: 100 });
    expect(rec.waits).toEqual([7000]);
  });

  it("honours Retry-After: HTTP-date and clamps negative deltas to 0", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const pastDate = new Date(0).toUTCString();
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      return rec.calls < 2 ? makeResponse(503, { "Retry-After": pastDate }) : makeResponse(200);
    };
    await fetchWithRetry(
      "https://x",
      {},
      { ...makeDeps(rec), fetchImpl, baseDelayMs: 100, now: () => 10_000 },
    );
    // Date is in the past relative to now=10000, so delta is clamped to 0.
    expect(rec.waits).toEqual([0]);
  });

  it("clamps wait to maxDelayMs", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      return makeResponse(503);
    };
    await fetchWithRetry(
      "https://x",
      {},
      {
        ...makeDeps(rec),
        fetchImpl,
        maxRetries: 2,
        baseDelayMs: 1000,
        factor: 100, // blow up quickly
        maxDelayMs: 5_000,
      },
    );
    // attempt 0 → 1000, attempt 1 → would be 100000, clamped to 5000
    expect(rec.waits).toEqual([1000, 5_000]);
  });

  it("retries on fetch rejections (network errors)", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      if (rec.calls < 3) throw new Error("network");
      return makeResponse(200);
    };
    const res = await fetchWithRetry(
      "https://x",
      {},
      { ...makeDeps(rec), fetchImpl, baseDelayMs: 50, factor: 2 },
    );
    expect(res.status).toBe(200);
    expect(rec.calls).toBe(3);
    expect(rec.waits).toEqual([50, 100]);
  });

  it("propagates a caller abort immediately without retrying", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const controller = new AbortController();
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      controller.abort(new DOMException("aborted", "AbortError"));
      throw controller.signal.reason;
    };
    await expect(
      fetchWithRetry("https://x", { signal: controller.signal }, { ...makeDeps(rec), fetchImpl }),
    ).rejects.toThrow(/aborted/);
    expect(rec.calls).toBe(1);
    expect(rec.waits).toEqual([]);
  });

  it("retries a per-attempt timeout with a fresh signal", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const signals: AbortSignal[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      rec.calls += 1;
      const signal = init?.signal;
      if (!signal) throw new Error("attempt signal is missing");
      signals.push(signal);
      if (rec.calls === 1) {
        return new Promise<Response>((_resolve, reject) => {
          const onAbort = () => reject(signal.reason);
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        });
      }
      return makeResponse(200);
    };
    const response = await fetchWithRetry(
      "https://x",
      {},
      {
        ...makeDeps(rec),
        attemptTimeoutMs: 1,
        fetchImpl,
        maxRetries: 1,
      },
    );
    expect(response.status).toBe(200);
    expect(rec.calls).toBe(2);
    expect(signals[0]).not.toBe(signals[1]);
  });

  it("does not let an attempt timeout cancel Retry-After sleep", async () => {
    let calls = 0;
    let attemptSignal: AbortSignal | null | undefined;
    let sleepSignal: AbortSignal | null | undefined = null;
    await fetchWithRetry(
      "https://x",
      {},
      {
        attemptTimeoutMs: 1,
        fetchImpl: async (_input, init) => {
          calls += 1;
          attemptSignal = init?.signal;
          return calls === 1 ? makeResponse(429, { "Retry-After": "30" }) : makeResponse(200);
        },
        maxRetries: 1,
        sleep: async (_ms, signal) => {
          sleepSignal = signal;
        },
      },
    );
    expect(attemptSignal).toBeDefined();
    expect(sleepSignal).toBeUndefined();
  });

  it("throws the final network error after exhausting retries", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      throw new Error("still down");
    };
    await expect(
      fetchWithRetry(
        "https://x",
        {},
        { ...makeDeps(rec), fetchImpl, maxRetries: 2, baseDelayMs: 10 },
      ),
    ).rejects.toThrow(/still down/);
    expect(rec.calls).toBe(3); // 1 initial + 2 retries
  });

  it("applies ±25% jitter when random is not 0.5", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      return makeResponse(503);
    };
    await fetchWithRetry(
      "https://x",
      {},
      {
        random: () => 0, // push to lower bound: multiplier = 1 + (0 - 0.5) * 0.5 = 0.75
        sleep: async (ms) => {
          rec.waits.push(ms);
        },
        now: () => 0,
        fetchImpl,
        maxRetries: 1,
        baseDelayMs: 1000,
        factor: 2,
      },
    );
    expect(rec.waits).toEqual([750]);
  });

  it("ignores Retry-After when the value is unparseable", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      return rec.calls < 2 ? makeResponse(503, { "Retry-After": "not-a-date" }) : makeResponse(200);
    };
    await fetchWithRetry(
      "https://x",
      {},
      { ...makeDeps(rec), fetchImpl, baseDelayMs: 42, factor: 1 },
    );
    expect(rec.waits).toEqual([42]);
  });

  it("never retries non-idempotent POST requests", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      return makeResponse(503);
    };
    const response = await fetchWithRetry(
      "https://x",
      { method: "POST" },
      { ...makeDeps(rec), fetchImpl },
    );
    expect(response.status).toBe(503);
    expect(rec.calls).toBe(1);
    expect(rec.waits).toEqual([]);
  });

  it("continues to retry idempotent PUT requests", async () => {
    const rec: Recorder = { calls: 0, waits: [] };
    const fetchImpl = async (): Promise<Response> => {
      rec.calls += 1;
      return rec.calls === 1 ? makeResponse(503) : makeResponse(200);
    };
    const response = await fetchWithRetry(
      "https://x",
      { method: "PUT" },
      { ...makeDeps(rec), fetchImpl },
    );
    expect(response.status).toBe(200);
    expect(rec.calls).toBe(2);
  });

  it("passes the request signal to the retry sleep", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | null | undefined;
    await fetchWithRetry(
      "https://x",
      { signal: controller.signal },
      {
        fetchImpl: async () => makeResponse(503),
        maxRetries: 1,
        random: () => 0.5,
        sleep: async (_ms, signal) => {
          receivedSignal = signal;
        },
      },
    );
    expect(receivedSignal).toBe(controller.signal);
  });
});
