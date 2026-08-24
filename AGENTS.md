# Repository Working Agreement

このファイルはリポジトリ全体に適用する。システムの構造と設計判断は [DESIGN.md](./DESIGN.md) を正本とし、ここにはエージェントが変更時に守る作業規約だけを記載する。

## 開発環境

- Node.js 22以上、pnpm 10以上を使う。依存関係は `pnpm-lock.yaml` を正本とし、npmやyarnのlockfileを追加しない。
- TypeScriptはESMとして扱い、内部importの拡張子は既存コードと同じく `.js` を使う。
- Cloudflare Workers設定は `wrangler.jsonc` を正本とする。bindingsやvarsを変更したら `pnpm types:worker` を実行する。
- `src/worker-configuration.d.ts` はWrangler生成物である。手編集せず、生成コマンドで更新する。
- ツール説明と利用者向けエラーは日本語で書き、コードの命名とコメントは周辺実装の言語・形式に合わせる。

## 変更時の規約

- [DESIGN.md](./DESIGN.md) の不変条件を維持する。特にBYOK・ステートレス性、リクエスト単位のMCPサーバー生成、部分更新の保持規則、POST非再試行、ログの秘密情報非出力を崩さない。
- エントリや固定ページの更新を変更するときは、未指定の本文・タイトル・記法・公開日時・スラッグが維持されることをテストする。
- XML処理を変更するときは、名前空間prefixの差、数値文字参照、必須フィールド、XML 1.0禁止文字を含む既存テストを維持する。
- 入力schemaとHTTP/XML処理には `src/utils/limits.ts` と `src/utils/body.ts` の上限を適用し、上限のない全量読み込みを追加しない。
- 認証情報、Authorizationヘッダ、上流レスポンス本文、任意の例外メッセージをログへ出さない。構造化エラーは `src/mcp/response.ts` の形式を使う。
- `ALLOWED_ORIGINS` は `wrangler.jsonc` の `vars` で管理する。一時的な `wrangler --var` だけを正本にしない。
- 利用者向け機能・設定・制約が変わったら `README.md` と `README.en.md` を同期し、フォーク固有の変更を `CHANGELOG.md` の `Unreleased` へ追記する。
- 責務、境界、データフロー、設計判断が変わったら `DESIGN.md` を同じ変更で更新する。

## テスト配置

- AtomPubクライアントとXMLは `test/atompub/`、Fotolifeは `test/fotolife/`、MCPツールは `test/mcp/`、共通処理は `test/utils/` に置く。
- CloudflareアダプターのHTTP・CORS・認証・MCP統合契約は `test/adapters/cloudflare.test.ts` で検証する。
- 実レスポンスに近いXMLは `test/fixtures/` へ置き、秘密値や実APIキーを含めない。
- coverage閾値は `vitest.config.ts` を正本とする。全体60%以上に加え、`src/atompub/xml.ts` と `src/mcp/tools/entries.ts` の個別閾値を維持する。

## 必須検証

通常のコード・設定変更では、リポジトリルートから次を実行する。

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm exec wrangler types src/worker-configuration.d.ts --env-interface Env --strict-vars=false --check
pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry-run
```

文書だけの変更では、対象Markdownのリンクと内容を確認し、`git diff --check` を実行する。生成型、Wrangler設定、コードへ変更が及ぶ場合は上記の全検証を実行する。
