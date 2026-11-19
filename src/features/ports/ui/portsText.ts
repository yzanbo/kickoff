// ポートを使っているプロセスの窓の文（純粋な関数）
import { PORT_ORIGIN_LABELS, type PortBandNote, type PortProcess } from "@shared/types";

/** 動いている時間（「30 秒」「12 分」「2 時間」「3 日」。分からなければ空） */
export function uptimeText(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} 時間`;
  return `${Math.floor(seconds / 86_400)} 日`;
}

/** 起動元の文（ほかのアプリなら、分かればアプリの名前を添える） */
export function originText(p: Pick<PortProcess, "origin" | "origin_app">): string {
  const label = PORT_ORIGIN_LABELS[p.origin];
  return p.origin === "other" && p.origin_app ? `${label}（${p.origin_app}）` : label;
}

/** 帯の添え書き（「feat-x の帯（開発サーバー）」「feat-y の帯（db）」。帯の中の名前がなければ「feat-y の帯」） */
export function bandText(note: Pick<PortBandNote, "label" | "slot">): string {
  return note.slot ? `${note.label} の帯（${note.slot}）` : `${note.label} の帯`;
}

/** 止める確かめの文の名前（「vite（:5173・kickoff）」） */
export function stopTargetText(p: Pick<PortProcess, "command" | "ports">, projectName: string): string {
  return `${p.command}（${p.ports.map((n) => `:${n}`).join(" ")}・${projectName}）`;
}

/** 開く URL（この Mac の中のポート） */
export const portUrl = (port: number) => `http://localhost:${port}`;
