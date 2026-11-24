// パネルのテストの補助: テストごとに自分の店を作って入れる（終わったら前の店に戻す。テストどうしで欄の状態を残さない）
import { onTestFinished } from "vitest";
import { Square } from "lucide-react";
import { defineTabKind, type AnyTabKind, type TabKind } from "./kind";
import { projectChatOpen } from "@/foundation/ui/storage/storageKeys";
import { defineSurface, type AnySurface } from "./surface";
import { createPanelStore, installPanelStore, type PanelStore } from "./state/panelStore";
import type { PanelTab } from "./panelTypes";

type TabOf<K extends PanelTab["kind"]> = Extract<PanelTab, { kind: K }>;

/** テストの種類（中身は描かない。後始末・持ち主のチャットなど、確かめる項目だけを extra で渡す） */
export function testTabKind<K extends PanelTab["kind"]>(id: K, extra: Partial<Omit<TabKind<TabOf<K>>, "id" | "is">> = {}): AnyTabKind {
  return defineTabKind({ id, icon: Square, label: () => id, projectOf: () => undefined, Page: () => null, ...extra } as Omit<TabKind<TabOf<K>>, "is">);
}

/** どの種類も入る店の既定（チャットはそのチャットを消したら閉じる） */
const DEFAULT_KINDS: readonly AnyTabKind[] = (
  ["new", "subagent", "changes", "file", "projectView", "projectFile", "note", "child", "newChild", "browser", "terminal"] as const
).map((id) => testTabKind(id));

/**
 * テストの店の欄（決まりは持ち主の機能の欄と同じ: 右サイドバー = browser の side、フッター = terminal の bottom、ブラウザの別ウィンドウ = browser の win。
 * panel のテストは機能を読まないので、確かめる決まり（入れる種類・空になったとき・開閉を覚える設定）だけを写す）
 */
const TEST_SURFACES: readonly AnySurface[] = [
  defineSurface({ id: "side", label: "右サイドバー", accepts: ["browser"], closeOnEsc: false, whenEmpty: "close", openSetting: projectChatOpen }),
  defineSurface({ id: "bottom", label: "下のパネル", accepts: ["terminal"], closeOnEsc: false, whenEmpty: "close" }),
  defineSurface({ id: "win", label: "ブラウザの別ウィンドウ", accepts: ["browser"], closeOnEsc: false, whenEmpty: "closeWindow" }),
];

/** テストの店を作って入れる。kinds は既定の種類を差し替える（id が同じものを置き換える） */
export function useTestPanelStore({ kinds = [] }: { kinds?: readonly AnyTabKind[] } = {}): PanelStore {
  const chat = testTabKind("chat", { ownerChatId: (t) => t.id });
  const all = [chat, ...DEFAULT_KINDS].map((k) => kinds.find((x) => x.id === k.id) ?? k);
  const store = createPanelStore({ kinds: all, surfaces: TEST_SURFACES });
  const before = installPanelStore(store);
  onTestFinished(() => void installPanelStore(before));
  return store;
}
