import type { ReactNode } from "react";
import type { Approval, Chat, ChatEvent, ChatLive } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { ApprovalCard } from "@/features/chat/approvals/ApprovalCard";
import { BackgroundTasks } from "@/features/chat/status/BackgroundTasks";
import { ReconnectRow } from "@/features/chat/status/ConnectionStatus";
import { Working } from "@/features/chat/status/Working";
import { CompactingRow } from "@/features/chat/status/CompactingRow";
import { AfterCompactMessages } from "@/features/chat/status/AfterCompactMessages";
import { useSentCompactPrompt } from "@/features/snippet/useCompactPrompt";
import { StreamingReply } from "./StreamingReply";
import type { TimelineScroll } from "./timelineScroll";

/**
 * 流れの終わり（最新の分）: 書いている途中の返答・確認のカード・作業中の行（返答を書いている間・ツールの実行中も出し続け、送ってからの経過時間を数える。
 * 会話を圧縮している間は、見分けのつく圧縮中の行と、その下に圧縮のあとに送る圧縮後指示と、圧縮中に「いま」で送った指示をその順に）・裏で動いている作業（1 件ずつ止められる）・通信が切れて止まり、つながるのを待っている行。
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
  const post = useSentCompactPrompt("post", chat.project_id);
  // 圧縮を待つ間（圧縮前指示の作業中・圧縮中）は、コアが圧縮の記録を受け取って預かりの先頭に入れる前から、圧縮後指示を送る順で見せる
  const waitingCompact = busy && (live.compacting !== null || live.awaiting_compact);
  const pendingPost = waitingCompact && !live.after_compact.some((m) => m.post_compact) ? post : null;
  return (
    <>
      {streaming && <StreamingReply text={streaming} scroll={scroll} />}
      {approvals.map((a) => (
        <ApprovalCard key={a.id} approval={a} />
      ))}
      {busy &&
        approvals.length === 0 &&
        (live.compacting ? <CompactingRow compacting={live.compacting} /> : <Working since={chat.turn_started_at}>{working}</Working>)}
      {/* 圧縮後指示と、圧縮中に「いま」で送った指示は、圧縮の行の下に送る順で（圧縮が終わったら伝える） */}
      {(live.after_compact.length > 0 || pendingPost !== null) && <AfterCompactMessages messages={live.after_compact} pendingPost={pendingPost} />}
      {busy && <BackgroundTasks chatId={chat.id} background={live.background} agents={agents} events={events} />}
      {!busy && live.reconnect && <ReconnectRow chatId={chat.id} reconnect={live.reconnect} />}
    </>
  );
}
