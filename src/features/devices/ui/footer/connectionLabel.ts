// 左下の接続の札の文（下の帯の札と詳細の見出し）
import type { ConnectionState } from "@/foundation/ui/api/serverConnection";

/** 下の帯の札の文（札はつながらないときだけ出す。open は詳細を開いたままつながったときだけ見える） */
const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connecting: "Kickoff サーバーから切断（再接続中）",
  open: "Kickoff サーバーに接続済み",
  closed: "Kickoff サーバーから切断",
};

/** 札の文。一度もつながっていない（起動してからつながらない）ときの connecting は「切断」でなく「接続中」 */
export function connectionLabel(state: ConnectionState, since: number | null): string {
  return state === "connecting" && since === null ? "Kickoff サーバーに接続中…" : CONNECTION_LABELS[state];
}
