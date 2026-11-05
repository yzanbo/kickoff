// 自動圧縮を始める量（設定の auto_compact_pct）と、Claude Code が実際に圧縮を始めるトークン数
// （CLAUDE_AUTOCOMPACT_PCT_OVERRIDE のときのしきい値は「窓 × 割合」と「窓 − 余白」の小さいほう）

/** 設定で選べる使用率の範囲（%） */
export const AUTO_COMPACT_PCT_MIN = 10;
export const AUTO_COMPACT_PCT_MAX = 95;

/** 画面で選べる使用率（%。設定の「チャット」と、チャット欄のメーターの詳細） */
export const AUTO_COMPACT_CHOICES = [30, 40, 50, 60, 70, 80, 90] as const;

/** Claude Code が窓の終わりに残す余白（トークン。割合を大きくしても、ここより手前で圧縮が始まる） */
const AUTO_COMPACT_BUFFER = 13_000;

/** 使用率 pct（%）を決めたときに、自動圧縮が始まるトークン数（窓が分からなければ null） */
export function autoCompactThreshold(windowSize: number | null, pct: number): number | null {
  if (!windowSize || windowSize <= 0) return null;
  return Math.max(0, Math.min(Math.round((windowSize * pct) / 100), windowSize - AUTO_COMPACT_BUFFER));
}

/** 子の Claude Code に足す環境変数（決めていなければ何も足さない＝ Claude Code の既定） */
export function autoCompactEnv(pct: number | null): Record<string, string> {
  return pct === null ? {} : { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: String(pct) };
}
