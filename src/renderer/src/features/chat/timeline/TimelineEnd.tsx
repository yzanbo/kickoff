import type { ReactNode } from "react";
import type { Approval, Chat, ChatEvent, ChatLive } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { ApprovalCard } from "@/features/chat/approvals/ApprovalCard";
import { BackgroundTasks } from "@/features/chat/status/BackgroundTasks";
import { ReconnectRow } from "@/features/chat/status/ConnectionStatus";
import { Working } from "@/features/chat/status/Working";
import { CompactingRow } from "@/features/chat/status/CompactingRow";
import { AfterCompactMessages } from "@/features/chat/status/AfterCompactMessages";
import { StreamingReply } from "./StreamingReply";
import type { TimelineScroll } from "./timelineScroll";

/**
 * 流れの終わり（最新の分）: 書いている途中の返答・確認のカード・作業中の行（返答を書いている間・ツールの実行中も出し続け、送ってからの経過時間を数える。
 * 会話を圧縮している間は、見分けのつく圧縮中の行と、その下に圧縮中に「いま」で送った指示）・裏で動いている作業（1 件ずつ止められる）・通信が切れて止まり、つながるのを待っている行。
 * working は作業中の行の文（useWorkingStatus。作業中でなければ null）
 */
export function TimelineEnd({
  chat,
  busy,
  streaming,
  approvals,
  working,
  live,
  agents,
  events,
  scroll,
}: {
  chat: Chat;
  busy: boolean;
  streaming: string;
  approvals: Approval[];
  working: ReactNode | null;
  live: ChatLive;
  agents: SubagentEntry[];
  /** 会話の記録（裏の作業の一覧の行から、流れの中のその呼び出しへ移る） */
  events: ChatEvent[];
  /** 流れのスクロール（書いている途中の返答が伸びたら、一番下を見ているときだけ付いていく） */
  scroll: TimelineScroll;
}) {
  return (
    <>
      {streaming && <StreamingReply text={streaming} scroll={scroll} />}
      {approvals.map((a) => (
        <ApprovalCard key={a.id} approval={a} />
      ))}
      {busy &&
        approvals.length === 0 &&
        (live.compacting ? <CompactingRow compacting={live.compacting} /> : <Working since={chat.turn_started_at}>{working}</Working>)}
      {/* 圧縮中に「いま」で送った指示は、圧縮の行の下に（圧縮が終わったら伝える） */}
      {live.after_compact.length > 0 && <AfterCompactMessages messages={live.after_compact} />}
      {busy && <BackgroundTasks chatId={chat.id} background={live.background} agents={agents} events={events} />}
      {!busy && live.reconnect && <ReconnectRow chatId={chat.id} reconnect={live.reconnect} />}
    </>
  );
}
