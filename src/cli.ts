#!/usr/bin/env node

import { runStdioServer } from "./adapters/stdio/index.js";
import { MissingCredentialsError } from "./utils/auth.js";

try {
  await runStdioServer();
} catch (error) {
  if (error instanceof MissingCredentialsError) {
    console.error("hatena-blog-mcp: HATENA_ID と HATENA_API_KEY を環境変数に設定してください。");
  } else {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(`hatena-blog-mcp: 起動できません (${errorName})。`);
  }
  process.exitCode = 1;
}
