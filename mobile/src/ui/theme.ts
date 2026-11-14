// 色と大きさ（Mac の Kickoff のダークの画面に合わせる。いまはダークだけ）
import { StyleSheet } from "react-native";
import type { SessionState } from "../state/hostSession";
import { mismatchLabel } from "../lib/version";

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

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16, gap: 12 },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  text: { color: colors.text, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.ng, fontSize: 13 },
  card: { backgroundColor: colors.elev, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: { backgroundColor: colors.elev, color: colors.text, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  button: { backgroundColor: colors.hover, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center" },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: "600" },
});

/** つながりの様子の文（つながっていれば null） */
export function sessionStateText(state: SessionState): string | null {
  switch (state.kind) {
    case "open":
      return null;
    case "connecting":
      return "つないでいます…";
    case "retrying":
      return `つながりません（${state.reason}）。つなぎ直します…`;
    case "mismatch":
      return mismatchLabel(state.mismatch);
    case "mobile_off":
      return "Mac の Kickoff の「スマホからつなぐ」がオフです";
    case "revoked":
      return "この端末の登録が取り消されました。外してから、Mac の設定でつなぎ直してください";
    case "other_host":
      return "この URL の先は、つないだときと別の本体です（Mac の Kickoff のデータを作り直したなど）。外してから、つなぎ直してください";
    case "stopped":
      return "止まっています";
  }
}
