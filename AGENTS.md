# Repository Working Agreement

このファイルはリポジトリ全体に適用する。システムの構造と設計判断は [DESIGN.md](./DESIGN.md) を正本とし、ここには変更時に守る作業規約と検証手順だけを記載する。

## 開発環境と公開境界

- Node.js 22以上、pnpm 10以上を使う。`pnpm-lock.yaml` を依存解決の正本とし、別のlockfileを追加しない。
- TypeScriptはNode ESMとして扱い、内部importでは出力後のパスに合う `.js` 拡張子を使う。
- 公開npmパッケージ名は `@kagayoi/hatena-blog-mcp`、実行コマンドは `hatena-blog-mcp`、成果物は `dist/` とする。
- 本製品はローカルstdio専用である。HTTPサーバー、リモートMCP、クラウドdeploy用アダプターや設定を、明示的な製品方針変更なしに再導入しない。
- 認証情報は `HATENA_ID` / `HATENA_API_KEY` から読み、コマンドライン引数、ログ、fixture、commitへ入れない。
- version変更、npm publish、Git commit・pushは、それぞれを明示されたリリースまたはGit操作の依頼時だけ行う。

## 変更時の規約

- [DESIGN.md](./DESIGN.md) の不変条件を維持する。特に部分更新の保持規則、POST非再試行、秘密情報を含まないログを崩さない。
- エントリや固定ページの更新を変更するときは、未指定の本文・タイトル・記法・公開日時・スラッグが維持されることをテストする。
- XML処理を変更するときは、namespace prefixの差、数値文字参照、必須フィールド、XML 1.0禁止文字を含む既存テストを維持する。
- 入力schemaとHTTP/XML処理には `src/utils/limits.ts` と `src/utils/body.ts` の上限を適用し、上限のない全量読み込みを追加しない。
- 認証情報、Authorization、上流レスポンス本文、任意の例外メッセージをログへ出さない。構造化エラーは `src/mcp/response.ts` の形式を使う。
- `package.json` の `bin`、`exports`、`types`、`files` を変更したら、生成tarballにCLI、JavaScript、型宣言、利用者向け文書が含まれ、秘密、テスト、エージェント向け文書が含まれないことを確認する。
- 利用者向け機能・設定・制約が変わったら `README.md` と `README.en.md` を同期し、`CHANGELOG.md` の `Unreleased` へ追記する。
- 責務、境界、データフロー、設計判断が変わったら `DESIGN.md` を同じ変更で更新する。

## テスト配置

- AtomPubクライアントとXMLは `test/atompub/`、Fotolifeは `test/fotolife/`、MCPツールは `test/mcp/`、共通処理は `test/utils/` に置く。
- stdio起動境界は `test/adapters/stdio.test.ts`、npm公開APIは `test/package.test.ts`、実プロセス統合は `scripts/smoke-stdio.mjs` で検証する。
- 実レスポンスに近いXMLは `test/fixtures/` へ置き、秘密値や実APIキーを含めない。
- coverage閾値は `vitest.config.ts` を正本とする。全体60%以上に加え、`src/atompub/xml.ts` と `src/mcp/tools/entries.ts` の個別閾値を維持する。

## 必須検証

通常のコード・設定変更では、リポジトリルートから次を実行する。

```powershell
pnpm install --frozen-lockfile
pnpm verify
npm pack --dry-run --json
git diff --check
```

公開構成を変更した場合は、生成したtarballを新しい一時ディレクトリへinstallし、そこに入ったCLIへstdio接続して13ツールを列挙できることも確認する。実際のpublishとversion更新はリリース依頼時だけ行う。
