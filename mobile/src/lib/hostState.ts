// 1 つの本体の一覧の様子（プロジェクト・チャット・回答待ち）。つながったときに読み、本体の知らせでその場で直す。純粋な関数でテストする
import type { Approval } from "@shared/chat/approvalTypes";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { isListedProject } from "@shared/projects/kinds";
import type { BusEvent } from "@shared/foundation/contract";
import { agentStateOf, boardColumnOf } from "@shared/chat/state";
import { byUrgency } from "@shared/chatList/urgency";
import type { AgentState } from "@shared/chat/types";

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

/** 一覧の 1 行（アーカイブ・子チャット・ノートのチャットは出さない。ボードと同じ急ぐ順（作業中 → 回答待ち → 未読 → 既読）→ 最後に動いた順） */
export interface ChatRow {
  chat: Chat;
  state: AgentState;
}

/** プロジェクトごとのチャットの一覧（チャットのないプロジェクトも出す。アーカイブしたプロジェクトと見えないプロジェクトは出さない） */
export function chatSections(state: HostState): { project: Project; rows: ChatRow[] }[] {
  const pending = new Set(state.approvals.map((a) => a.chat_id));
  return state.projects
    .filter((p) => p.archived_at === null && isListedProject(p))
    .map((project) => ({
      project,
      rows: state.chats
        .filter((c) => c.project_id === project.id && c.archived_at === null && c.parent_chat_id === null && c.note_path === null)
        .map((chat) => ({ chat, state: agentStateOf(chat, pending.has(chat.id)) }))
        .sort((a, b) => byUrgency(boardColumnOf(a.state), boardColumnOf(b.state)) || b.chat.active_at.localeCompare(a.chat.active_at)),
    }));
}
