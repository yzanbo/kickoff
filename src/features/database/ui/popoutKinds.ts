// database の別ウィンドウの種類と URL の項目の表（app/renderer/popout/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** DB クライアント（右の欄の DB のタブ。worktree は SQLite のファイルを開く作業場所） */
    database: { chatId: number; projectId: number; worktree?: string };
  }
}

export const databasePopout: PopoutKind<"database"> = { kind: "database", fields: { chatId: { kind: "number", param: "chat" }, projectId: { kind: "number", param: "project" }, worktree: "string?" } };
