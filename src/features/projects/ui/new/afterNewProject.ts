// 新しいプロジェクトを作ったあとの処理（App の新しいプロジェクトのダイアログが、頼まれた after のとおりに行う）。
// 処理は持ち主の機能が拡張点 newProjectAfters に登録する（チャットを移すのは chat、下書きを移すのは chatPanel）
import type { Project } from "@shared/projects/types";
import { open } from "@/foundation/ui/navigation/open";
import { definePoint } from "@/foundation/ui/points";
import type { NewProjectAfter, NewProjectAfterMap } from "./openNewProject";

export interface NewProjectAfterHandler {
  kind: string;
  run(after: NewProjectAfter, project: Project): void;
}

export const newProjectAfters = definePoint<NewProjectAfterHandler>("newProjectAfters", { key: (h) => h.kind });

/** 種類 kind の処理を作る（値の形は NewProjectAfterMap の kind の項目。runAfterNewProject が kind で選んでから呼ぶ） */
export function defineNewProjectAfter<K extends keyof NewProjectAfterMap>(kind: K, run: (after: Extract<NewProjectAfter, { kind: K }>, project: Project) => void): NewProjectAfterHandler {
  return { kind, run: (after, project) => run(after as Extract<NewProjectAfter, { kind: K }>, project) };
}

/** 作ったプロジェクトで、頼まれた処理をする（なければ、そのプロジェクトで新しいチャットを開く） */
export function runAfterNewProject(after: NewProjectAfter | undefined, project: Project) {
  if (!after) return open({ kind: "newChat", projectId: project.id });
  newProjectAfters.items().find((h) => h.kind === after.kind)?.run(after, project);
}
