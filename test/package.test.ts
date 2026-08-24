import { describe, expect, it } from "vitest";
import worker, { createApp } from "../src/index.js";

describe("npm package entry", () => {
  it("Cloudflare Workers用のdefault exportとfactoryを公開する", () => {
    expect(typeof worker.fetch).toBe("function");
    expect(typeof createApp().fetch).toBe("function");
  });
});
