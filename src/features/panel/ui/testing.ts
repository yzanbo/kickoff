// パネルのテストの補助: テストごとに自分の店を作って入れる（終わったら前の店に戻す。テストどうしで欄の状態を残さない）
import { onTestFinished } from "vitest";
import { Square } from "lucide-react";
import { defineTabKind, type AnyTabKind, type TabKind } from "./kind";
import { PANEL_SURFACES } from "./surfaces";
import { createPanelStore, installPanelStore, type PanelStore } from "./state/panelStore";
import type { PanelTab } from "./tabs/panelTypes";

type TabOf<K extends PanelTab["kind"]> = Extract<PanelTab, { kind: K }>;

/** テストの種類（中身は描かない。後始末・持ち主のチャットなど、確かめる項目だけを extra で渡す） */
export function testTabKind<K extends PanelTab["kind"]>(id: K, extra: Partial<Omit<TabKind<TabOf<K>>, "id" | "is">> = {}): AnyTabKind {
  return defineTabKind({ id, icon: Square, label: () => id, projectOf: () => undefined, Page: () => null, ...extra } as Omit<TabKind<TabOf<K>>, "is">);
}

/** どの種類も入る店の既定（チャットはそのチャットを消したら閉じる） */
const DEFAULT_KINDS: readonly AnyTabKind[] = (
  ["new", "subagent", "changes", "file", "projectView", "projectFile", "note", "database", "github", "ci", "docker", "trash", "child", "newChild", "browser", "terminal"] as const
).map((id) => testTabKind(id));

/** テストの店を作って入れる。kinds は既定の種類を差し替える（id が同じものを置き換える） */
export function useTestPanelStore({ kinds = [] }: { kinds?: readonly AnyTabKind[] } = {}): PanelStore {
  const chat = testTabKind("chat", { ownerChatId: (t) => t.id });
  const all = [chat, ...DEFAULT_KINDS].map((k) => kinds.find((x) => x.id === k.id) ?? k);
  const store = createPanelStore({ kinds: all, surfaces: PANEL_SURFACES });
  const before = installPanelStore(store);
  onTestFinished(() => void installPanelStore(before));
  return store;
}
