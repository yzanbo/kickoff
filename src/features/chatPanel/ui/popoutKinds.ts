// chatPanel の別ウィンドウの種類と URL の項目の表（app/renderer/popout/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** サブエージェントの画面（agentKey はサブエージェントの一覧の行のキー） */
    subagent: { chatId: number; agentKey: string };
    /** 子チャット（チャットの画面そのもの。chatId は子チャット） */
    chat: { chatId: number };
    /** 右端のチャット欄（アプリに 1 つ。メインのウィンドウで開いているプロジェクトの欄を出す） */
    side: Record<never, never>;
    /**
     * チャットのパネルのチャット（いちばん上の親）・送る前の新しいチャットのタブ（panel は移す元の欄、key はタブのキー。chatId がなければ新しいチャットで、
     * 中身（書きかけの文・添付など）は localStorage の panel:popout-tab-handoff で渡す）。開いた別ウィンドウはタブの列を持ち、ほかのチャットのタブもドラッグで足せる
     * （@/features/panel/ui/popout/tabWindow.ts）
     */
    chats: { panel: string; key: string; chatId?: number; projectId: number };
  }
}

export const subagentPopout: PopoutKind<"subagent"> = { kind: "subagent", fields: { chatId: { kind: "number", param: "chat" }, agentKey: { kind: "string", param: "agent" } } };
export const chatPopout: PopoutKind<"chat"> = { kind: "chat", fields: { chatId: { kind: "number", param: "chat" } } };
export const sidePopout: PopoutKind<"side"> = { kind: "side", fields: {} };
export const chatsPopout: PopoutKind<"chats"> = {
  kind: "chats",
  fields: { panel: "string", key: "string", projectId: { kind: "number", param: "project" }, chatId: { kind: "number?", param: "chat" } },
};
