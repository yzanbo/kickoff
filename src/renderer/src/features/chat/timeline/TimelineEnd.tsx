import type { ReactNode } from "react";
import type { Approval, Chat, ChatLive } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { Markdown } from "@/ui/markdown/Markdown";
import { ApprovalCard } from "@/features/chat/approvals/ApprovalCard";
import { BackgroundTasks } from "@/features/chat/status/BackgroundTasks";
import { ReconnectRow } from "@/features/chat/status/ConnectionStatus";
import { Working } from "@/features/chat/status/Working";
import { CompactingRow } from "@/features/chat/status/CompactingRow";
import { CompactNextRow } from "@/features/chat/status/CompactNextRow";

/**
 * 流れの終わり（最新の分）: 書いている途中の返答・確認のカード・作業中の行（返答を書いている間・ツールの実行中も出し続け、送ってからの経過時間を数える。
 * 会話を圧縮している間は、見分けのつく圧縮中の行）・圧縮の予約（終わったら圧縮が始まる。取り消せる）・裏で動いている作業（1 件ずつ止められる）・通信が切れて止まり、つながるのを待っている行。
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
}: {
  chat: Chat;
  busy: boolean;
  streaming: string;
  approvals: Approval[];
  working: ReactNode | null;
  live: ChatLive;
  agents: SubagentEntry[];
}) {
  return (
    <>
      {streaming && (
        <div className="assistant live">
          <Markdown streaming>{streaming}</Markdown>
        </div>
      )}
      {approvals.map((a) => (
        <ApprovalCard key={a.id} approval={a} />
      ))}
      {busy &&
        approvals.length === 0 &&
        (live.compacting ? <CompactingRow compacting={live.compacting} /> : <Working since={chat.turn_started_at}>{working}</Working>)}
      {/* 作業中に圧縮を予約していれば、終わったらすぐ圧縮が始まることを伝える（取り消せる） */}
      {busy && live.compact_next && !live.compacting && <CompactNextRow chatId={chat.id} />}
      {busy && <BackgroundTasks chatId={chat.id} background={live.background} agents={agents} />}
      {!busy && live.reconnect && <ReconnectRow chatId={chat.id} reconnect={live.reconnect} />}
    </>
  );
}
