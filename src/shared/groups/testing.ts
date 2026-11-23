// グループのテストのデータ（テストからだけ使う）
import type { ChatGroup } from "@shared/groups/types";
import { TEST_TIME } from "@shared/foundation/testing/data";

/** チャットのグループ（名前は「G<id>」、プロジェクト 1、並び順は id） */
export function makeGroup(id: number, patch: Partial<ChatGroup> = {}): ChatGroup {
  return { id, project_id: 1, name: `G${id}`, position: id, hue: 0, created_at: TEST_TIME, ...patch };
}
