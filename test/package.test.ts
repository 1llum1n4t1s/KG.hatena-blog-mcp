import { describe, expect, it } from "vitest";
import {
  createBasicCredentials,
  createServer,
  createStdioServer,
  SERVER_INFO,
} from "../src/index.js";

describe("npm package entry", () => {
  it("Node stdioサーバー用の公開APIを提供する", () => {
    expect(SERVER_INFO.name).toBe("hatena-blog-mcp");
    expect(typeof createServer).toBe("function");
    expect(typeof createStdioServer).toBe("function");
    expect(typeof createBasicCredentials).toBe("function");
  });
});
