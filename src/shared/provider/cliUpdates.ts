// AI の CLI の新しい版の見分け方（コアの設定の「接続」と、開発用のスクリプト scripts/check-agent-updates.mjs で共通）。
// スクリプトが Node でそのまま読む（型を取り除いて動かす）ので、ほかのファイルを import しない・型の注釈で消せる書き方だけにする

/** 版（2.1.322・0.169.0 など）を数字の段ごとに比べる。a が新しければ正、同じなら 0、古ければ負 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Codex の入れ方（上げ方と、最新の版を聞く先が入れ方で違う。Homebrew の cask は npm より遅れて出ることがある） */
export type CodexInstallSource = "brew_cask" | "npm";

/** 入れ方の名前（画面・知らせの文） */
export const CODEX_INSTALL_SOURCE_LABELS: Record<CodexInstallSource, string> = {
  brew_cask: "Homebrew の cask",
  npm: "npm",
};

/** 上げるコマンド */
export const CODEX_UPDATE_COMMANDS: Record<CodexInstallSource, string> = {
  brew_cask: "brew upgrade --cask codex",
  npm: "npm install -g @openai/codex@latest",
};

/** 最新の版を聞く先（JSON） */
export const CODEX_LATEST_URLS: Record<CodexInstallSource, string> = {
  brew_cask: "https://formulae.brew.sh/api/cask/codex.json",
  npm: "https://registry.npmjs.org/@openai/codex/latest",
};

/** codex の実行ファイルの実体のパス（リンクを解いたもの）から入れ方を見分ける。分からなければ null（上げ方が分からないので知らせない） */
export function codexInstallSource(realPath: string): CodexInstallSource | null {
  if (realPath.includes("/Caskroom/codex/")) return "brew_cask";
  if (realPath.includes("/node_modules/@openai/codex/")) return "npm";
  return null;
}

/** `codex --version` の出力（「codex-cli 0.169.0」）から版を取り出す。読めなければ null */
export function parseCodexVersion(output: string): string | null {
  const line = output.trim().split("\n").at(-1) ?? "";
  return line.match(/(\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.]+)?)\s*$/)?.[1] ?? null;
}

/** 聞いた先の答えから最新の版を取り出す（cask も npm も version）。読めなければ null */
export function codexLatestOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const latest = (body as { version?: unknown }).version;
  return typeof latest === "string" && /^\d+\.\d+/.test(latest) ? latest : null;
}

/** 新しい版があるか（読めないものは知らせない） */
export function isNewer(latest: string | null, current: string | null): boolean {
  return Boolean(latest && current && compareVersions(latest, current) > 0);
}
