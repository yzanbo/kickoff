// 承認なしで流してよいコマンド（どのチャットも同じ。Git の読み取りと、テスト・型チェック・ビルド）。Claude Code は許可ルールに写す。
// 承認を聞いてくる CLI（Codex・Copilot・ACP）の「毎回確認」はこれを見ない（門の byMode。いまのとおり）

const GIT_READ = ["git status", "git diff", "git log", "git show", "git branch"];
const CHECK_COMMANDS = [
  "npm test",
  "npm run test",
  "npm run lint",
  "npm run typecheck",
  "npm run build",
  "pnpm test",
  "pnpm run test",
  "pnpm run lint",
  "pnpm run typecheck",
  "pnpm run build",
  "npx tsc",
  "npx vitest run",
  "pytest",
  "python -m pytest",
  "go test",
  "cargo test",
];

export const ALLOWED_COMMANDS: readonly string[] = [...GIT_READ, ...CHECK_COMMANDS];
