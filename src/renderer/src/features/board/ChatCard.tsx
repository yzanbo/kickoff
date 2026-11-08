import { busyWithUnread } from "@shared/chat/state";
import { AGENT_STATE_LABELS, type AgentState, type Chat } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import type { ChatTitleEditor } from "@/features/chat/useChatRename";
import { relativeTime } from "@/lib/time";
import { ChatTitleInput } from "@/features/chat/ChatTitleInput";
import { ProjectChip } from "@/features/project/ProjectChip";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";
import { STATE_TONE } from "@/features/chat/tones";
import { StatusDot } from "@/ui/StatusDot";
import { StatusSlot } from "@/features/chat/StatusSlot";

interface Props {
  chat: Chat;
  state: AgentState;
  /** 全プロジェクトのボードでは、プロジェクトのバッジを出す */
  projectName?: string;
  /** 回答待ちの数 */
  pending?: number;
  /** 名前をその場で変えている途中のとき */
  rename?: ChatTitleEditor;
}


/**
 * ボードのカードの中身（状態の印と名前・ラベル・回答待ち・時刻）。状態は名前の左に、サイドバーの行と同じ印（StatusSlot。作業中は回るリング・
 * 回答待ちは！・未読は緑の点、作業中のまま未読なら緑の点を重ねる）で出す（利用者の依頼。前は下の行に点と「既読」などの文）
 */
export function ChatCardContent({ chat, state, projectName, pending = 0, rename }: Props) {
  return (
    <>
      <div className="card-title-row">
        <StatusSlot state={state} unread={busyWithUnread(chat, state)} />
        {rename ? <ChatTitleInput chat={chat} editor={rename} /> : <span className="card-title">{chatTitle(chat.title)}</span>}
      </div>
      <div className="card-labels">
        {projectName !== undefined && <ProjectChip id={chat.project_id} name={projectName} />}
        <WorktreeChip chat={chat} />
        {chat.archived_at && <span className="archived-chip">アーカイブ済み</span>}
      </div>
      <div className="card-foot">
        {pending > 0 && <span className="card-pending">回答 {pending}件</span>}
        <span className="card-time">{relativeTime(chat.active_at)}</span>
      </div>
    </>
  );
}

/** リスト表示の行の中身 */
export function ChatRowContent({ chat, state, projectName, rename }: Props) {
  return (
    <>
      <div className="list-main">
        {rename ? <ChatTitleInput chat={chat} editor={rename} /> : <span className="card-title one-line">{chatTitle(chat.title)}</span>}
        <span className="list-meta">
          {projectName !== undefined && <ProjectChip id={chat.project_id} name={projectName} />}
          <WorktreeChip chat={chat} />
          {chat.archived_at && <span className="archived-chip">アーカイブ済み</span>}
          <StatusDot color={STATE_TONE[state]} />
          <span className="muted small">{AGENT_STATE_LABELS[state]}</span>
          {busyWithUnread(chat, state) && <UnreadMark />}
        </span>
      </div>
      <span className="card-time">{relativeTime(chat.active_at)}</span>
    </>
  );
}

/** 作業中のまま、まだ見ていない返答がある（状態の横に添える） */
function UnreadMark() {
  return <span className="card-unread">未読あり</span>;
}
