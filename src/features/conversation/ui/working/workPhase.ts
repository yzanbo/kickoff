// 作業中の段階（コアの ChatLive.phase と、圧縮まわりの欄）の読み方。画面で圧縮まわりの欄を読むのはここと compact の compactHold.ts だけ
import type { ChatLive } from "@shared/chat/chatLive";
import type { AfterCompactUntil } from "@/features/compact/ui";

/** 子チャットで親の会話を写しているか（動かし始める前。作業中の行に「親の会話を引き継いでいます」） */
export const isInheriting = (live: Pick<ChatLive, "phase" | "preparing_for">): boolean => live.phase === "preparing" && live.preparing_for === "inherit";

/** 圧縮を待つ間か（圧縮前指示の作業中・圧縮中。コアが圧縮の記録を受け取る前から、圧縮後指示を送る順で見せる） */
export const isWaitingCompact = (live: Pick<ChatLive, "phase">): boolean => live.phase === "compacting" || live.phase === "awaiting_compact";

/**
 * 作業中に預かった「いま」の指示をいつ送るか（圧縮を待つ間 = 圧縮のあと / いまの作業に足せなくなったあと = 作業の終わり /
 * 圧縮したやり取りの途中 = そのやり取りの終わり / ほか = 作業の終わり）。作業していなければ呼ぶ側が next
 */
export function afterCompactUntilOf(live: Pick<ChatLive, "phase" | "input_closed" | "compaction">): AfterCompactUntil {
  if (isWaitingCompact(live)) return "compact";
  return live.input_closed ? "closed" : live.compaction.done ? "exchange" : "turn";
}
