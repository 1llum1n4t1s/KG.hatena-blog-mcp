import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { performance } from "node:perf_hooks";
import { setImmediate as nextTurn } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AtomPubClient } from "../dist/atompub/client.js";
import { FotolifeClient } from "../dist/fotolife/client.js";
import { createServer } from "../dist/mcp/server.js";

// 実資格情報・外部サービスを使わず、SDKから上流境界までの挙動を確認する。
const credentials = { authHeader: "Basic c21va2U6c21va2U=", hatenaId: "smoke" };
const fixture = (name) =>
  readFileSync(new URL(`../test/fixtures/${name}.xml`, import.meta.url), "utf8");
const entries = fixture("entry-single");
const pages = fixture("page-single");
const image = fixture("fotolife-entry");
const retry = { maxRetries: 0, baseDelayMs: 0 };
const results = [];
const logs = [];
const originalError = console.error;
console.error = (...args) => logs.push(args.join(" "));

async function check(name, run) {
  const start = performance.now();
  try {
    const evidence = await run();
    results.push({ name, passed: true, elapsedMs: performance.now() - start, evidence });
  } catch (error) {
    results.push({
      name,
      passed: false,
      elapsedMs: performance.now() - start,
      error: error.message,
    });
  }
}

async function withMcp(options, run) {
  const server = createServer({ credentials, retry, ...options });
  const client = new Client({ name: "behavior-smoke", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return await run(client);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function cancelUpdate(kind, cancelContext = false) {
  const started = deferred();
  const release = deferred();
  const controller = new AbortController();
  const calls = [];
  let upstreamSignal;
  const xml = kind === "entry" ? entries : pages;
  return withMcp(
    {
      ...(cancelContext ? { signal: controller.signal } : {}),
      fetchImpl: async (_input, init) => {
        init.signal?.throwIfAborted();
        calls.push(init.method);
        if (init.method === "GET") {
          upstreamSignal = init.signal;
          started.resolve();
          await release.promise;
          init.signal?.throwIfAborted();
        }
        return new Response(xml);
      },
    },
    async (client) => {
      const pending = client
        .callTool(
          {
            name: `update_${kind}`,
            arguments: { blog_id: "smoke.hatenablog.com", [`${kind}_id`]: "123", title: "変更" },
          },
          undefined,
          cancelContext ? undefined : { signal: controller.signal },
        )
        .catch(() => undefined);
      try {
        await started.promise;
        controller.abort();
        await nextTurn();
        await nextTurn();
      } finally {
        release.resolve();
      }
      await pending;
      await nextTurn();
      await nextTurn();
      assert.equal(upstreamSignal.aborted, true);
      assert.deepEqual(calls, ["GET"]);
      assert.equal((await client.listTools()).tools.length, 13);
      if (!cancelContext) {
        const independent = await client.callTool({
          name: `get_${kind}`,
          arguments: { blog_id: "smoke.hatenablog.com", [`${kind}_id`]: "123" },
        });
        assert.equal(independent.isError, undefined);
        assert.equal(upstreamSignal.aborted, false);
        assert.deepEqual(calls, ["GET", "GET"]);
      }
      return { calls, canceledUpdateSentPut: false, connectionStillUsable: true };
    },
  );
}

async function checkPartialUpdate(kind) {
  const xml = kind === "entry" ? entries : pages;
  const calls = [];
  let write;
  return withMcp(
    {
      fetchImpl: async (_input, init) => {
        calls.push(init.method);
        if (init.method === "PUT") write = init.body;
        return new Response(xml);
      },
    },
    async (client) => {
      const response = await client.callTool({
        name: `update_${kind}`,
        arguments: {
          blog_id: "smoke.hatenablog.com",
          [`${kind}_id`]: "123",
          title: "タイトルだけ更新",
        },
      });
      assert.equal(response.isError, undefined);
      assert.deepEqual(calls, ["GET", "PUT"]);
      assert.ok(write.includes("<title>タイトルだけ更新</title>"));
      assert.ok(write.includes('type="text/x-markdown"'));
      assert.ok(write.includes("<app:draft>no</app:draft>"));
      assert.ok(write.includes("<app:preview>no</app:preview>"));
      assert.ok(!write.includes("<updated>"));
      assert.ok(!write.includes("<hatenablog:custom-url>"));
      assert.ok(write.includes(kind === "entry" ? "## はじめに" : "# About"));
      if (kind === "entry") assert.ok(write.includes('<category term="技術"'));
      return { calls, omittedFieldsPreserved: true };
    },
  );
}

async function checkImages() {
  let posts = 0;
  const data = Buffer.alloc(10 * 1024 * 1024, 97).toString("base64");
  return withMcp(
    {
      fetchImpl: async (_input, init) => {
        assert.equal(init.method, "POST");
        assert.ok(init.body.includes(data));
        posts += 1;
        return new Response(image, { status: 201 });
      },
    },
    async (client) => {
      const result = await client.callTool({
        name: "upload_image",
        arguments: {
          title: "最大サイズ",
          content_type: "image/png",
          data_base64: data,
        },
      });
      assert.equal(result.isError, undefined);
      assert.equal(posts, 1);
      assert.ok(result.structuredContent.blog_syntax.endsWith(":plain]"));
      for (const invalid of [" ", "***=", "abc", "a===", "aa=a", "AAAA".repeat(data.length / 4)]) {
        const before = posts;
        const rejected = await client.callTool({
          name: "upload_image",
          arguments: {
            title: "不正データ",
            content_type: "image/png",
            data_base64: invalid,
          },
        });
        assert.equal(rejected.isError, true);
        assert.equal(posts, before);
      }
      return { decodedBytes: 10 * 1024 * 1024, posts, invalidInputsRejected: 6 };
    },
  );
}

async function checkPostRetry() {
  let posts = 0;
  return withMcp(
    {
      retry: { maxRetries: 3, sleep: async () => {} },
      fetchImpl: async () => {
        posts += 1;
        return new Response("upstream unavailable", { status: 503 });
      },
    },
    async (client) => {
      const result = await client.callTool({
        name: "upload_image",
        arguments: {
          title: "POST",
          content_type: "image/png",
          data_base64: "aGVsbG8=",
        },
      });
      assert.equal(result.isError, true);
      assert.equal(posts, 1);
      return { posts, retries: 0 };
    },
  );
}

async function checkBodies(kind) {
  const http = createHttpServer((request, response) => {
    if (request.url === "/oversized") {
      response.writeHead(200, { "content-length": String(9 * 1024 * 1024) });
      response.flushHeaders();
    } else {
      response.writeHead(200, { "content-type": "application/xml" });
      response.write("<entry>");
      if (request.url === "/disconnected") setTimeout(() => response.destroy(), 100);
    }
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${http.address().port}`;
  const codes = {};
  try {
    for (const [mode, expected] of [
      ["stalled", "network_error"],
      ["disconnected", "network_error"],
      ["oversized", "parse_error"],
    ]) {
      let receivedHeaders = false;
      const options = {
        credentials,
        retry,
        requestTimeoutMs: 500,
        fetchImpl: async (_input, init) => {
          const response = await fetch(`${base}/${mode}`, init);
          receivedHeaders = true;
          return response;
        },
      };
      const client =
        kind === "atompub"
          ? new AtomPubClient({ ...options, blogId: "smoke" })
          : new FotolifeClient(options);
      const request =
        kind === "atompub" ? client.getEntry("123") : client.getImage("20260824010101");
      const error = await request.then(
        () => null,
        (cause) => cause,
      );
      assert.ok(error);
      assert.equal(receivedHeaders, true, "本文読込に到達したことを確認する");
      codes[mode] = error.code;
      assert.equal(error.code, expected);
    }
    return codes;
  } finally {
    http.closeAllConnections();
    await new Promise((resolve) => http.close(resolve));
  }
}

// 異常時も終了できるよう、検証全体に上限を設ける。
const deadline = setTimeout(() => {
  originalError("behavior smoke exceeded 30 seconds");
  process.exit(1);
}, 30_000);
deadline.unref();
try {
  await check("10 MiB upload and invalid inputs", checkImages);
  await check("POST is not retried", checkPostRetry);
  for (const kind of ["entry", "page"]) {
    await check(`${kind} request cancellation`, () => cancelUpdate(kind));
    await check(`${kind} context cancellation`, () => cancelUpdate(kind, true));
    await check(`${kind} partial update`, () => checkPartialUpdate(kind));
  }
  for (const kind of ["atompub", "fotolife"]) {
    await check(`${kind} body errors`, () => checkBodies(kind));
  }
} finally {
  clearTimeout(deadline);
  console.error = originalError;
}
const report = {
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  results,
  logs,
};
const reportOption = process.argv.indexOf("--report");
if (reportOption >= 0) {
  assert.ok(process.argv[reportOption + 1], "--report requires a path");
  writeFileSync(process.argv[reportOption + 1], `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx",
  });
}
const failed = results.filter((result) => !result.passed);
console.log(`behavior smoke: ${results.length - failed.length}/${results.length} scenarios passed`);
for (const result of failed) console.error(`${result.name}: ${result.error}`);
if (results.some((result) => !result.passed) && !process.argv.includes("--observe"))
  process.exitCode = 1;
