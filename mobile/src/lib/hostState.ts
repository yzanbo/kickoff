// 1 つの本体の一覧の様子（プロジェクト・チャット・回答待ち）。つながったときに読み、本体の知らせでその場で直す。純粋な関数でテストする
import type { Approval, BusEvent, Chat, Project } from "@shared/types";
import { agentStateOf } from "@shared/chat/state";
import type { AgentState } from "@shared/types";

export interface HostState {
  projects: Project[];
  chats: Chat[];
  approvals: Approval[];
}

export const emptyHostState: HostState = { projects: [], chats: [], approvals: [] };

const upsert = <T extends { id: number | string }>(list: readonly T[], item: T): T[] => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
};

/** 本体の知らせを当てる（関係のない知らせなら同じものを返す） */
export function applyHostEvent(state: HostState, e: BusEvent): HostState {
  switch (e.type) {
    case "chat":
      return { ...state, chats: upsert(state.chats, e.chat) };
    case "chat_deleted":
      return { ...state, chats: state.chats.filter((c) => c.id !== e.id), approvals: state.approvals.filter((a) => a.chat_id !== e.id) };
    case "project":
      return { ...state, projects: upsert(state.projects, e.project) };
    case "project_deleted":
      return { ...state, projects: state.projects.filter((p) => p.id !== e.id), chats: state.chats.filter((c) => c.project_id !== e.id) };
    case "approval":
      return { ...state, approvals: upsert(state.approvals, e.approval) };
    case "approval_resolved":
      return { ...state, approvals: state.approvals.filter((a) => a.id !== e.id) };
    default:
      return state;
  }
}

/** 一覧の 1 行（アーカイブ・子チャット・メモのチャットは出さない。回答待ち → 作業中 → 未読 → 最後に動いた順） */
export interface ChatRow {
  chat: Chat;
  state: AgentState;
}

const STATE_ORDER: Record<AgentState, number> = { needs_input: 0, failed: 1, running: 2, unread: 3, read: 4 };

/** プロジェクトごとのチャットの一覧（チャットのないプロジェクトも出す。アーカイブしたプロジェクトは出さない） */
export function chatSections(state: HostState): { project: Project; rows: ChatRow[] }[] {
  const pending = new Set(state.approvals.map((a) => a.chat_id));
  return state.projects
    .filter((p) => p.archived_at === null)
    .map((project) => ({
      project,
      rows: state.chats
        .filter((c) => c.project_id === project.id && c.archived_at === null && c.parent_chat_id === null && c.memo_path === null)
        .map((chat) => ({ chat, state: agentStateOf(chat, pending.has(chat.id)) }))
        .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.chat.active_at.localeCompare(a.chat.active_at)),
    }));
}
