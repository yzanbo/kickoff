// 表示用に、リポジトリの絶対パスを相対パスにする（会話の流れ・サブエージェントの画面が読む）

/**
 * 表示用にリポジトリの絶対パスを相対パスにする（`repo/` を外し、リポジトリそのものは「.」）。
 * `repo-worktrees/...` のように、リポジトリの名前に文字が続く別のパスは変えない
 */
export function relativize(text: string, repo: string): string {
  if (!repo) return text;
  const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`${escaped}/|${escaped}(?![\\w.-])`, "g"), (m) => (m.endsWith("/") ? "" : "."));
}

/** 作業場所ごとの、絶対パスを相対パスにする関数（同じ作業場所なら同じ関数。流れの各項目の memo が効くように） */
const relatives = new Map<string, (s: string) => string>();
const asIs = (s: string) => s;
export function relativeOf(repo: string | undefined): (s: string) => string {
  if (!repo) return asIs;
  let fn = relatives.get(repo);
  if (!fn) relatives.set(repo, (fn = (s: string) => relativize(s, repo)));
  return fn;
}
