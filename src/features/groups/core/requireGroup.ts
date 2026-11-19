import type { ChatGroup } from "@shared/types";
import { Invalid, NotFound } from "@/foundation/core/errors";

/** グループ。なければ 404、ほかのプロジェクトのものなら 400（チャットを入れられるのは同じプロジェクトのグループだけ） */
export function requireGroupOf(groups: { get(id: number): ChatGroup | undefined }, groupId: number, projectId: number): ChatGroup {
  const group = groups.get(groupId);
  if (!group) throw new NotFound("グループが見つかりません");
  if (group.project_id !== projectId) throw new Invalid("ほかのプロジェクトのグループには入れられません");
  return group;
}
