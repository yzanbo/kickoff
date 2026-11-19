// ゴミ箱の一覧の文（純粋な関数）
import type { TrashKind } from "@shared/types";

/** 消えるまでの残り（「あと 2 日 5 時間」「あと 3 時間」「あと 12 分」） */
export function remainingText(expiresAt: string, now = Date.now()): string {
  const min = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 60_000));
  const days = Math.floor(min / (24 * 60));
  const hours = Math.floor((min % (24 * 60)) / 60);
  if (days > 0) return `あと ${days} 日${hours > 0 ? ` ${hours} 時間` : ""}`;
  if (hours > 0) return `あと ${hours} 時間`;
  return `あと ${min % 60} 分`;
}

/** 完全に消す前の確かめの文で、種類ごとに一緒に消えるもの（ファイル・フォルダは名前だけで分かるので添えない） */
const PURGE_EXTRAS: Partial<Record<TrashKind, string>> = {
  chat: "チャットは会話の記録ごと消えます。",
  project: "プロジェクトのチャット・DB の接続・定型文・設定ごと消えます（プロジェクトのフォルダは消えません）。",
  session: "会話記録のファイルが消えます。",
  worktree: "控えに入れた、取り込んでいないコミット・途中の変更も消えます。",
};

/** 完全に消す前の確かめの文（1 件なら種類ごとに一緒に消えるもの、いくつもなら入っている種類の分を添える） */
export function purgeMessage(kinds: readonly TrashKind[]): string {
  const extras = [...new Set(kinds)].flatMap((kind) => PURGE_EXTRAS[kind] ?? []);
  return ["3 日を待たずに、いますぐ消します。元に戻せません。", ...extras].join("");
}
