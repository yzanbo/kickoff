// グループの機能のコアの入口（ほかの機能はここだけを読む）
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { ProjectsApi } from "@/features/projects/core/index";
import { groupRoutes } from "./routes";
import { createGroupStore, type GroupMembers, type GroupStore } from "./db/groups";

export type { GroupStore } from "./db/groups";

export interface GroupsApi {
  /** グループの店（上の機能が読む） */
  store: GroupStore;
  /** グループのチャット（上の chat が登録する。グループを消したら、中のチャットをグループなしに戻して知らせる） */
  useMembers(members: GroupMembers): void;
}

export { requireGroupOf } from "./requireGroup";

/** チャットのグループ（店とルート） */
export function createGroups(k: Kernel, deps: { projects: ProjectsApi }): CoreFeature<GroupsApi> {
  let members: GroupMembers | null = null;
  const store = createGroupStore(k.db, (e) => k.bus.publish(e), { idsIn: (group) => members?.idsIn(group) ?? [], ungrouped: (chatId) => members?.ungrouped(chatId) });
  return {
    name: "groups",
    api: { store, useMembers: (given) => void (members = given) },
    routes: [groupRoutes({ groups: store, projectParam: deps.projects.param })],
  };
}
