import { Pin } from "lucide-react";
import type { ReactNode } from "react";
import type { AgentState, Chat } from "@shared/chat/types";
import { useTicker } from "@/foundation/ui/hooks/useTicker";
import { formatDayTime, relativeTime } from "@/foundation/ui/lib/time";
import { useChatActivity, workingFor } from "@/features/chat/ui";

/**
 * チャットの行の中身（サイドバーのチャットの行・下書きの行で 1 つ）: 先頭の印（状態の印・下書きの鉛筆）・名前の行（前に添えるもの・名前・後ろに添えるもの・ピン・時刻）・2 行目の札。
 * editor を渡すと、名前の行と札の代わりに名前の入力欄
 */
export function ChatRowFace({ mark, editor, lead, title, after, pinned = false, time, meta }: {
  mark: ReactNode;
  editor?: ReactNode;
  /** 名前の前（プロジェクトの印・子チャットの深さの札） */
  lead?: ReactNode;
  title?: ReactNode;
  /** 名前の後ろ（添付の印） */
  after?: ReactNode;
  pinned?: boolean;
  time?: ReactNode;
  /** 2 行目（グループと作業場所の札。1 行で出すときは CSS で隠す） */
  meta?: ReactNode;
}) {
  return (
    <>
      {mark}
      <span className="chat-row-body">
        {editor ?? (
          <>
            <span className="chat-row-line">
              {lead}
              <span className="chat-row-title">{title}</span>
              {after}
              {pinned && (
                <span className="chat-row-pin" title="ピン留め中" aria-label="ピン留め中">
                  <Pin size={11} aria-hidden />
                </span>
              )}
              {time}
            </span>
            {meta}
          </>
        )}
      </span>
    </>
  );
}

/** 行の時刻（最後に動いた時刻。作業中は経過時間「作業中 3分」で、乗せるといまの作業） */
export function ChatRowTime({ chat, state }: { chat: Chat; state: AgentState }) {
  if (state === "running") return <RunningTime chat={chat} />;
  return (
    <span className="chat-row-time" title={formatDayTime(chat.active_at)}>
      {relativeTime(chat.active_at, { style: "short" })}
    </span>
  );
}

function RunningTime({ chat }: { chat: Chat }) {
  useTicker(30_000);
  const activity = useChatActivity(chat.id);
  const since = chat.turn_started_at ?? chat.active_at;
  return (
    <span className="chat-row-time running" title={`${activity ?? "作業中"}\n始めた時刻: ${formatDayTime(since)}`}>
      {workingFor(since)}
    </span>
  );
}
