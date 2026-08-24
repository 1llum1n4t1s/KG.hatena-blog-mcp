# CLAUDE.md — hatena-blog-mcp

リポジトリの作業規約は [AGENTS.md](./AGENTS.md)、現在実装の設計正本は [DESIGN.md](./DESIGN.md) を参照する。このファイルはClaude系クライアント向けの最小入口であり、設計説明を重複させない。

## 現在の製品境界

- Node.js 22以上で動くローカルMCP stdioサーバー。
- npmパッケージは `@kagayoi/hatena-blog-mcp`、実行コマンドは `hatena-blog-mcp`。
- 認証は `HATENA_ID` / `HATENA_API_KEY` 環境変数から取得する。
- 公開HTTP endpointや外部ホスティングは製品範囲に含めない。
- 全13ツール、部分更新、POST非再試行、秘密を含まないログの不変条件を維持する。

## Git規約

- コミットへ共著者情報、生成元フッター、署名行を追加しない。
- authorとcommitterは `Keisuke Nishitani <99869611+Keisuke69@users.noreply.github.com>` とし、グローバルGit設定は変更しない。
- commit、push、version変更、npm publishは明示された依頼時だけ行う。
