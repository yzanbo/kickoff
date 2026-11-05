import type { ReactNode } from "react";
import type { Approval, Chat, ChatLive } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { Markdown } from "@/ui/markdown/Markdown";
import { ApprovalCard } from "@/features/chat/approvals/ApprovalCard";
import { BackgroundTasks } from "@/features/chat/status/BackgroundTasks";
import { ReconnectRow } from "@/features/chat/status/ConnectionStatus";
import { Working } from "@/features/chat/status/Working";

/**
 * 流れの終わり（最新の分）: 書いている途中の返答・確認のカード・作業中の行（返答を書いている間・ツールの実行中も出し続け、送ってからの経過時間を数える。
 * ）・裏で動いている作業（1 件ずつ止められる）・通信が切れて止まり、つながるのを待っている行。
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
      {busy && approvals.length === 0 && <Working since={chat.turn_started_at}>{working}</Working>}
      {busy && <BackgroundTasks chatId={chat.id} background={live.background} agents={agents} />}
      {!busy && live.reconnect && <ReconnectRow chatId={chat.id} reconnect={live.reconnect} />}
    </>
  );
}
