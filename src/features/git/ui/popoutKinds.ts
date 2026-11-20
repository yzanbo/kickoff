// git の別ウィンドウの種類と URL の項目の表（app/renderer/popout/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** 作業場所のコミットしていない変更（focus のファイルの位置へ移る） */
    changes: { chatId: number; projectId: number; worktree?: string; focus?: string };
  }
}

export const changesPopout: PopoutKind<"changes"> = {
  kind: "changes",
  // 移るファイルはいちばん後ろ（同じウィンドウかは focus を除いて見る）
  fields: { chatId: { kind: "number", param: "chat" }, projectId: { kind: "number", param: "project" }, worktree: "string?", focus: "string?" },
  keyIgnores: ["focus"],
};
