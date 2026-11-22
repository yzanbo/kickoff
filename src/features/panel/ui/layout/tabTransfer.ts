// ブラウザ・チャットのタブを、ウィンドウをまたいでドラッグで移す（Chrome と同じ）: 別ウィンドウのタブを元の欄（右サイドバー・チャットのパネル）の
// タブの列に落とすと戻り、元の欄のタブを別ウィンドウのタブの列に落とすとそこへ移る。webview はウィンドウをまたげないので、ブラウザは移した先でいまのページを開き直す。
// 落とした側がタブを開き、元の欄（ほかのウィンドウなら知らせ tabMovedOut で）は後始末なしで閉じる（チャットはサイドバーとの連動で足し直されないよう、表示だけ消したことにする）
import { useEffect } from "react";
import { onWindowMessage, postWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { panelTabs, type AnyTabKind, type TransferredTab } from "@/features/panel/ui/kind";
import { closeTab, openTab } from "@/features/panel/ui/state/actions";
import { kindOf, panelStateOf, peekPanel, subscribePanels } from "@/features/panel/ui/state/panelStore";
import type { PanelKind } from "@/features/panel/ui/surface";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";

/** 渡すもの（どの欄のどのタブか） */
interface MovingTab {
  panel: string;
  tab: PanelTab;
}

/** 移せるタブの種類ごとの dataTransfer の型（同じアプリのウィンドウの間なら、独自の型も渡る。受ける欄は、出す種類で受け取れる型だけを見る） */
export const movingMimeOf = (kind: string): string => `application/x-kickoff-moving-tab-${kind}`;

/** 移せる種類（種類の transfer があるもの） */
const movableKinds = (): AnyTabKind[] => panelTabs.items().filter((k) => k.transfer);

/** ドラッグを始めたタブを、ほかのウィンドウでも受け取れるよう dataTransfer に入れる（移せない種類は入れない） */
export function writeMovingTab(data: DataTransfer, panel: string, tab: PanelTab): void {
  const transfer = kindOf(tab).transfer;
  if (transfer) data.setData(movingMimeOf(tab.kind), JSON.stringify({ panel, tab: transfer.save(tab) }));
}

/** この欄（出す種類）で受け取れる、移しているタブの型（なければ null） */
export function movingMimeFor(types: readonly string[], shows: (kind: PanelKind) => boolean): string | null {
  for (const kind of movableKinds()) if (shows(kind.transfer!.shownAs) && types.includes(movingMimeOf(kind.id))) return movingMimeOf(kind.id);
  return null;
}

/** 渡された形をその種類のタブに（知らない種類・形が合わなければ null） */
export function loadTransferredTab(value: unknown): PanelTab | null {
  if (typeof value !== "object" || value === null) return null;
  const tab = value as Partial<TransferredTab>;
  if (typeof tab.key !== "string") return null;
  return (movableKinds().find((k) => k.id === tab.kind)?.transfer!.load(tab as TransferredTab) as PanelTab | null | undefined) ?? null;
}

/** dataTransfer の中身を読む（形が合わなければ null） */
export function parseMovingTab(raw: string): MovingTab | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { panel, tab } = v as { panel?: unknown; tab?: unknown };
    const loaded = loadTransferredTab(tab);
    return typeof panel === "string" && loaded ? { panel, tab: loaded } : null;
  } catch {
    return null;
  }
}

/** 元の欄から閉じる（後始末なし。種類によっては表示だけ消したことにする） */
const closeMoved = (panel: string, key: string, dismiss: boolean) => closeTab(panel, key, { dismiss, keep: true });

/**
 * 落とされたタブをこの欄に開き、元の欄から閉じる（このウィンドウの欄ならここで、ほかのウィンドウなら知らせて）。開いたタブのキーを返す
 */
export function takeMovingTab(panel: string, moving: MovingTab): string {
  const { tab } = moving;
  openTab(panel, tab);
  // 元の欄がこのウィンドウにあるかは読むだけで見る（ほかのウィンドウの欄を、このウィンドウの店に作らない）
  const dismiss = kindOf(tab).transfer?.dismiss === true;
  if (moving.panel !== panel && peekPanel(moving.panel)?.tabs.some((t) => t.key === tab.key)) closeMoved(moving.panel, tab.key, dismiss);
  else postWindowMessage("tabMovedOut", { panel: moving.panel, key: tab.key, dismiss });
  return tab.key;
}

/**
 * ほかのウィンドウへドラッグで移したタブを、この欄から閉じる（後始末はしない）。まだタブがなければ、足されたときに閉じる
 * （チャットの別ウィンドウで送ってできたチャットは、サーバーの知らせでこの欄のサイドバーとの連動からも足されるので、足された時点で表示だけ消す）
 */
export function useMovedOutTabs(panel: string): void {
  useEffect(() => {
    const waiting = new Map<string, boolean>();
    const closeIfPresent = (key: string, dismiss: boolean) => {
      if (!panelStateOf(panel).tabs.some((t) => t.key === key)) return false;
      closeMoved(panel, key, dismiss);
      return true;
    };
    const offMessages = onWindowMessage("tabMovedOut", (m) => {
      if (m.panel !== panel) return;
      if (!closeIfPresent(m.key, m.dismiss)) waiting.set(m.key, m.dismiss);
    });
    const offPanels = subscribePanels(() => {
      for (const [key, dismiss] of waiting) if (closeIfPresent(key, dismiss)) waiting.delete(key);
    });
    return () => {
      offMessages();
      offPanels();
    };
  }, [panel]);
}
