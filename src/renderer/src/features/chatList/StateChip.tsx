import type { ReactNode } from "react";
import { busyWithUnread } from "@shared/chat/state";
import type { AgentState, Chat } from "@shared/types";
import { STATE_TONE } from "@/features/chat/tones";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { ToneChip } from "@/ui/ToneChip";
import type { BucketHead } from "./buckets";

/**
 * 状態のまとまりの札の左の印: サイドバーのチャットの行と同じ状態の印（StatusSlot。作業中は回るリング・回答待ちは琥珀色の！・未読は緑の点・既読は薄い点）。
 * 作業中のまとまりに、作業中のまま未読のあるチャットがあれば、行と同じくリングの右上に緑の点を重ねる（利用者の依頼。前はどの状態も色の点だけで、作業中も回らなかった）。
 * 状態のないまとまり（アーカイブ済みなど）は undefined（札は色の点のまま）
 */
export function bucketMark(bucket: Pick<BucketHead, "column">, chats: readonly Chat[] = []): ReactNode {
  const column = bucket.column;
  if (!column) return undefined;
  return <StatusSlot state={column} unread={column === "running" && chats.some((chat) => busyWithUnread(chat, "running"))} />;
}

/** 状態のまとまりの札（状態ごとのチャットの一覧・画面の見出しの数・ボードのグループの小見出し）。左の印は bucketMark、状態のないまとまりは色の点 */
export function BucketChip({ bucket, tone, count, chats }: { bucket: Pick<BucketHead, "column" | "label">; tone: string; count: number; chats: readonly Chat[] }) {
  const mark = bucketMark(bucket, chats);
  return <ToneChip tone={tone} dot={!mark} icon={mark} label={bucket.label} count={count} />;
}

/** 1 つのチャットの状態の札（フィードのカード）。左の印はサイドバーの行と同じ StatusSlot（作業中のまま未読なら緑の点を重ねる） */
export function StateChip({ state, label, unread }: { state: AgentState; label: string; unread: boolean }) {
  return <ToneChip tone={STATE_TONE[state]} icon={<StatusSlot state={state} unread={unread} />} label={label} />;
}
