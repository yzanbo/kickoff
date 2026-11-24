// 色（Mac の Kickoff のダークの画面に合わせる。いまはダークだけ）。react-native に依らない（純粋な関数の図のページでも使うため）
import type { StateTone } from "@shared/chat/stateLooks";

export const colors = {
  bg: "#1b1f20",
  elev: "#232829",
  hover: "#2c3234",
  border: "#363d40",
  text: "#e6e8e9",
  muted: "#9aa3a7",
  accent: "#4aa3df",
  ok: "#4cbb7f",
  ng: "#e0655f",
  warn: "#d9a64a",
  running: "#4aa3df",
};

/** 状態の色の役割（@shared/chat/stateLooks の tone）→ 色 */
export const TONE_COLORS: Record<StateTone, string> = { "needs-input": colors.warn, failed: colors.ng, running: colors.running, unread: colors.ok, read: colors.border, draft: colors.muted };
