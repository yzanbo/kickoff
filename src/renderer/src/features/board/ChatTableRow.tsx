import type { CSSProperties, HTMLAttributes } from "react";
import { busyWithUnread } from "@shared/chat/state";
import { AGENT_STATE_LABELS, type AgentState, type Chat } from "@shared/types";
import { chatTitle, NO_GROUP_LABEL } from "@/features/chat/chatTitle";
import type { ChatTitleEditor } from "@/features/chat/useChatRename";
import { ChatTitleInput } from "@/features/chat/ChatTitleInput";
import { STATE_TONE } from "@/features/chat/tones";
import { modelDisplayName } from "@/features/chat/options/models";
import { ProjectChip } from "@/features/project/ProjectChip";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";
import { cx } from "@/lib/cx";
import { formatTokens } from "@/lib/format";
import { formatDayTime, formatFullDateTime, relativeTime } from "@/lib/time";
import { useGroup } from "@/stores/groups";
import { useModels } from "@/stores/providers";
import { StatusDot } from "@/ui/StatusDot";
import { contextRatio, type ChatSortKey } from "./chatSort";

interface Props {
  chat: Chat;
  state: AgentState;
  /** 出す列（名前はいつも先頭。並びは CHAT_SORT_KEYS の順） */
  columns: readonly ChatSortKey[];
  projectName?: string;
  pending: number;
  rename?: ChatTitleEditor;
  className?: string;
  /** 行の操作（chatCardProps。クリック・Enter で開く・右クリックでメニュー） */
  rowProps: HTMLAttributes<HTMLTableRowElement>;
}

/** 表の 1 行（チャット 1 つ）。押すとカード・リストの行と同じく開く */
export function ChatTableRow({ chat, state, columns, projectName, pending, rename, className, rowProps }: Props) {
  return (
    <tr className={cx("chat-table-row", className)} {...rowProps}>
      {columns.map((key) => (
        <td key={key} className={`chat-table-cell cell-${key}`}>
          <Cell column={key} chat={chat} state={state} projectName={projectName} pending={pending} rename={rename} />
        </td>
      ))}
    </tr>
  );
}

function Cell({ column, chat, state, projectName, pending, rename }: Omit<Props, "columns" | "rowProps" | "className"> & { column: ChatSortKey }) {
  switch (column) {
    case "title":
      return (
        <span className="chat-table-title">
          {rename ? <ChatTitleInput chat={chat} editor={rename} /> : <span className="card-title one-line">{chatTitle(chat.title)}</span>}
          {chat.archived_at && <span className="archived-chip">アーカイブ済み</span>}
          {pending > 0 && <span className="card-pending">回答 {pending}件</span>}
        </span>
      );
    case "project":
      return <ProjectChip id={chat.project_id} name={projectName ?? ""} />;
    case "group":
      return <GroupCell chat={chat} />;
    case "state":
      return (
        <span className="chat-table-state">
          <StatusDot color={STATE_TONE[state]} />
          {AGENT_STATE_LABELS[state]}
          {busyWithUnread(chat, state) && <span className="card-unread">未読あり</span>}
        </span>
      );
    case "worktree":
      return <WorktreeChip chat={chat} />;
    case "model":
      return <ModelCell model={chat.model} />;
    case "turns":
      return <span className="num">{chat.num_turns}</span>;
    case "cost":
      return <span className="num">${chat.cost_usd.toFixed(2)}</span>;
    case "context": {
      const ratio = contextRatio(chat);
      return ratio === undefined ? (
        <Blank />
      ) : (
        <span className="num" title={`${formatTokens(chat.context_tokens ?? 0)} / ${formatTokens(chat.context_window ?? 0)} トークン`}>
          {Math.round(ratio * 100)}%
        </span>
      );
    }
    case "active":
      return <span title={formatFullDateTime(chat.active_at)}>{relativeTime(chat.active_at)}</span>;
    case "created":
      return <span title={formatFullDateTime(chat.created_at)}>{formatDayTime(chat.created_at)}</span>;
  }
}

/** 値のないセル */
const Blank = () => <span className="chat-table-blank">—</span>;

/** グループ名（グループの色の点。グループなしは No Group を薄く） */
function GroupCell({ chat }: { chat: Chat }) {
  const group = useGroup(chat.project_id, chat.group_id);
  if (!group) return <span className="chat-table-blank">{NO_GROUP_LABEL}</span>;
  return (
    <span className="chat-table-group group-hued" style={{ "--group-hue": group.hue } as CSSProperties}>
      {group.name}
    </span>
  );
}

function ModelCell({ model }: { model: string | null }) {
  const models = useModels();
  return model ? <span>{modelDisplayName(models, model)}</span> : <Blank />;
}
