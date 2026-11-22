// chatPanel のテストの補助: テストごとにパネルの店を作って入れる（終わったら前の店に戻す）。種類は中身を描かないチャット・新しいチャット・子チャット
import { onTestFinished } from "vitest";
import { Square } from "lucide-react";
import { createPanelStore, defineTabKind, installPanelStore, type PanelTab } from "@/features/panel/ui";

/** 中身を描かない種類（チャットはそのチャットを消したら閉じる） */
const KINDS = [
  defineTabKind<Extract<PanelTab, { kind: "chat" }>>({ id: "chat", icon: Square, label: () => "chat", projectOf: (t) => t.projectId, ownerChatId: (t) => t.id, Page: () => null }),
  defineTabKind<Extract<PanelTab, { kind: "new" }>>({ id: "new", icon: Square, label: () => "new", projectOf: () => undefined, Page: () => null }),
  defineTabKind<Extract<PanelTab, { kind: "child" }>>({ id: "child", icon: Square, label: () => "child", projectOf: (t) => t.projectId, Page: () => null }),
];

/** テストの店を作って入れる（欄の決まりは既定のまま） */
export function useChatPanelTestStore(): ReturnType<typeof createPanelStore> {
  const store = createPanelStore({ kinds: KINDS, surfaces: [] });
  const before = installPanelStore(store);
  onTestFinished(() => void installPanelStore(before));
  return store;
}
