import type { ReactNode } from "react";
import type { Approval } from "@shared/chat/approvalTypes";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { ChatLive } from "@shared/chat/chatLive";
import type { Chat } from "@shared/chat/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { ApprovalCard } from "@/features/conversation/ui/approvals/ApprovalCard";
import { BackgroundTasks } from "@/features/conversation/ui/background/BackgroundTasks";
import { ReconnectRow } from "@/features/conversation/ui/working/ConnectionStatus";
import { Working } from "@/features/chat/ui/parts/Working";
import { WorkingExecution } from "@/features/conversation/ui/working/WorkingExecution";
import { CompactingRow } from "@/features/compact/ui/CompactingRow";
import { AfterCompactMessages } from "@/features/compact/ui/AfterCompactMessages";
import { afterCompactUntilOf, isWaitingCompact } from "@/features/conversation/ui/working/workPhase";
import { VisualPending } from "@/features/visuals/ui";
import { WorkplaceMoveRow } from "@/features/workplaceMove/ui/WorkplaceMoveRow";
import { useSentCompactPrompt } from "@/features/compact/ui/useCompactPrompt";
import { StreamingReply } from "@/features/conversation/ui/streaming/StreamingReply";

/**
 * 流れの終わり（最新の分）: 書いている途中の返答・書いている途中の図の枠・確認のカード・作業中の行（返答を書いている間・ツールの実行中も出し続け、送ってからの経過時間を数える。
 * 会話を圧縮している間は、見分けのつく圧縮中の行と、その下に圧縮のあとに送る圧縮後指示と、圧縮前指示から圧縮のあとのやり取りが終わるまでに「いま」で送った指示をその順に。
 * 圧縮後指示を送ったあとも、預かった指示はそのやり取りが終わるまで作業中の行の下に残す）・裏で動いている作業（1 件ずつ止められる）・AI が作業場所を移す予約（取り消せる）・
 * 通信が切れて止まり、つながるのを待っている行。
 * working は作業中の行の文（useWorkingStatus。作業中でなければ null）
 */
export function TimelineEnd({
  chat,
  busy,
  streaming,
  visible,
  approvals,
  working,
  live,
  agents,
  events,
}: {
  chat: Chat;
  busy: boolean;
  /** 書いている途中の返答があるか（文はチャットの店の口から StreamingReply が読む） */
  streaming: boolean;
  /** チャットが見えているか（見えていない間は書いている途中の返答を少しずつ出さない） */
  visible: boolean;
  approvals: Approval[];
  working: ReactNode | null;
  live: ChatLive;
  agents: SubagentEntry[];
  /** 会話の記録（裏の作業の一覧の行から、流れの中のその呼び出しへ移る） */
  events: ChatEvent[];
}) {
  const post = useSentCompactPrompt("post", chat.project_id);
  // 圧縮を待つ間（圧縮前指示の作業中・圧縮中）は、コアが圧縮の記録を受け取って預かりの先頭に入れる前から、圧縮後指示を送る順で見せる
  const waitingCompact = busy && isWaitingCompact(live);
  const pendingPost = waitingCompact && !live.now.some((m) => m.post_compact) ? post : null;
  // いまの作業に足せなくなったあとの「いま」は、作業の終わりに送る
  const until = busy ? afterCompactUntilOf(live) : "next";
  return (
    <>
      {streaming && <StreamingReply chatId={chat.id} visible={visible} />}
      {/* AI が図の中身を書いている間（呼び出しの記録はまだない）は、描く位置に枠だけ */}
      {busy && live.drawing_visual && <VisualPending />}
      {approvals.map((a) => (
        <ApprovalCard key={a.id} approval={a} />
      ))}
      {busy &&
        approvals.length === 0 &&
        (live.compacting ? <CompactingRow compacting={live.compacting} /> : <Working since={chat.turn_started_at} details={<WorkingExecution chat={chat} events={events} />}>{working}</Working>)}
      {/* 圧縮後指示と、預かった「いま」の指示は、圧縮の行・作業中の行の下に送る順で */}
      {(live.now.length > 0 || pendingPost !== null) && <AfterCompactMessages messages={live.now} pendingPost={pendingPost} until={until} />}
      {busy && <BackgroundTasks chatId={chat.id} background={live.background} agents={agents} events={events} />}
      {live.workplace_move && <WorkplaceMoveRow chatId={chat.id} reservation={live.workplace_move} />}
      {!busy && live.reconnect && <ReconnectRow chatId={chat.id} reconnect={live.reconnect} />}
    </>
  );
}
