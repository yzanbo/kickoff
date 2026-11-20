// files の別ウィンドウの種類と URL の項目の表（app/renderer/popout/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** 作業場所のファイルの中身（line を目立たせる） */
    file: { chatId: number; projectId: number; worktree?: string; path: string; line?: number };
  }
}

export const filePopout: PopoutKind<"file"> = {
  kind: "file",
  fields: { chatId: { kind: "number", param: "chat" }, projectId: { kind: "number", param: "project" }, worktree: "string?", path: "string", line: "number?" },
};
