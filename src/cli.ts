#!/usr/bin/env node

import { runStdioServer } from "./adapters/stdio/index.js";
import { translate } from "./i18n.js";
import { MissingCredentialsError } from "./utils/auth.js";

// 起動時の案内は人が読む文言なので、実行環境の言語に合わせて出す（AI へ返す文言は英語固定）。
try {
  await runStdioServer();
} catch (error) {
  if (error instanceof MissingCredentialsError) {
    console.error(translate("cli.missingCredentials"));
  } else {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(translate("cli.startFailed", { errorName }));
  }
  process.exitCode = 1;
}
