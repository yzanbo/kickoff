// notes の別ウィンドウの種類と URL の項目の表（app/renderer/popout/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /**
     * プロジェクトのノート（path はノートのフォルダからの相対）。chatId は開いたチャット（ノートをそのチャットの入力欄に添付する先。
     * チャットごとに別のウィンドウ）。ノートのタブなど、チャットの外から開いたものはなし
     */
    note: { projectId: number; path: string; chatId?: number };
  }
}

export const notePopout: PopoutKind<"note"> = { kind: "note", fields: { projectId: { kind: "number", param: "project" }, path: "string", chatId: { kind: "number?", param: "chat" } } };
