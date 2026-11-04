import type { ChatGroup } from "@shared/types";
import { request } from "./http";

/** チャットのグループ（コアの routes/groups.ts）。並べ替えは、並べたあとのそのプロジェクトのグループの一覧が返る */
export const groupsApi = {
  groups: (projectId: number) => request<ChatGroup[]>("GET", `/api/projects/${projectId}/groups`),
  createGroup: (projectId: number, name: string) => request<ChatGroup>("POST", `/api/projects/${projectId}/groups`, { name }),
  renameGroup: (groupId: number, name: string) => request<ChatGroup>("PATCH", `/api/groups/${groupId}`, { name }),
  reorderGroups: (projectId: number, ids: number[]) => request<ChatGroup[]>("PUT", `/api/projects/${projectId}/groups/order`, { ids }),
  /** グループだけを消す（中のチャットはグループなしに戻る） */
  deleteGroup: (groupId: number) => request<void>("DELETE", `/api/groups/${groupId}`),
};
