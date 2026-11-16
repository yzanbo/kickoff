// ブラウザ・チャットのタブを、ウィンドウをまたいでドラッグで移す（Chrome と同じ。利用者の依頼）: 別ウィンドウのタブを元の欄（右サイドバー・チャットのパネル）の
// タブの列に落とすと戻り、元の欄のタブを別ウィンドウのタブの列に落とすとそこへ移る。webview はウィンドウをまたげないので、ブラウザは移した先でいまのページを開き直す。
// 落とした側がタブを開き、元の欄（ほかのウィンドウなら知らせ tabMovedOut で）は後始末なしで閉じる（チャットはサイドバーとの連動で足し直されないよう、表示だけ消したことにする）
import { useEffect } from "react";
import { postWindowMessage, subscribeWindowMessages } from "@/app/windowBus";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelStateOf } from "@/features/panel/state/panelStore";
import type { PanelKind } from "@/features/panel/state/panelKinds";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";

/** ウィンドウをまたいで移せるタブ（中身の形） */
export type MovableTab = { kind: "browser"; key: string; url: string; title: string } | { kind: "chat"; key: string; id: number; projectId: number };

/** 渡すもの（どの欄のどのタブか） */
interface MovingTab {
  panel: string;
  tab: MovableTab;
}

/** 移せるタブの種類ごとの dataTransfer の型（同じアプリのウィンドウの間なら、独自の型も渡る。受ける欄は、出すタブの種類の型だけを見る） */
export const MOVING_TAB_MIMES: Readonly<Record<MovableTab["kind"], string>> = {
  browser: "application/x-kickoff-moving-tab-browser",
  chat: "application/x-kickoff-moving-tab-chat",
};

/** タブを移せる形にする（ブラウザはいまのページで。移せない種類は null） */
function movableTab(tab: PanelTab): MovableTab | null {
  if (tab.kind === "browser") return { kind: "browser", key: tab.key, url: tab.current ?? tab.url, title: tab.title };
  if (tab.kind === "chat") return { kind: "chat", key: tab.key, id: tab.id, projectId: tab.projectId };
  return null;
}

/** ドラッグを始めたタブを、ほかのウィンドウでも受け取れるよう dataTransfer に入れる（移せない種類は入れない） */
export function writeMovingTab(data: DataTransfer, panel: string, tab: PanelTab): void {
  const movable = movableTab(tab);
  if (movable) data.setData(MOVING_TAB_MIMES[movable.kind], JSON.stringify({ panel, tab: movable } satisfies MovingTab));
}

/** この欄（出す種類）で受け取れる、移しているタブの型（なければ null） */
export function movingMimeFor(types: readonly string[], shows: (kind: PanelKind) => boolean): string | null {
  for (const [kind, mime] of Object.entries(MOVING_TAB_MIMES) as [MovableTab["kind"], string][]) if (shows(kind) && types.includes(mime)) return mime;
  return null;
}

/** dataTransfer の中身を読む（形が合わなければ null） */
export function parseMovingTab(raw: string): MovingTab | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { panel, tab } = v as { panel?: unknown; tab?: Record<string, unknown> | null };
    if (typeof panel !== "string" || typeof tab !== "object" || tab === null || typeof tab.key !== "string") return null;
    if (tab.kind === "browser" && typeof tab.url === "string" && typeof tab.title === "string") return { panel, tab: { kind: "browser", key: tab.key, url: tab.url, title: tab.title } };
    if (tab.kind === "chat" && typeof tab.id === "number" && typeof tab.projectId === "number") return { panel, tab: { kind: "chat", key: tab.key, id: tab.id, projectId: tab.projectId } };
    return null;
  } catch {
    return null;
  }
}

/** 元の欄から閉じる（後始末なし。チャットは表示だけ消したことにする） */
const closeMoved = (panel: string, key: string, kind: MovableTab["kind"]) => panelActions(panel).closeTab(key, { dismiss: kind === "chat", keep: true });

/**
 * 落とされたタブをこの欄に開き、元の欄から閉じる（このウィンドウの欄ならここで、ほかのウィンドウなら知らせて）。開いたタブのキーを返す
 */
export function takeMovingTab(panel: string, moving: MovingTab): string {
  const { tab } = moving;
  panelActions(panel).openPanelTab(tab);
  if (moving.panel !== panel && panelStateOf(moving.panel).tabs.some((t) => t.key === tab.key)) closeMoved(moving.panel, tab.key, tab.kind);
  else postWindowMessage({ type: "tabMovedOut", panel: moving.panel, key: tab.key, kind: tab.kind });
  return tab.key;
}

/** ほかのウィンドウへドラッグで移したタブを、この欄から閉じる（後始末はしない） */
export function useMovedOutTabs(panel: string): void {
  useEffect(
    () =>
      subscribeWindowMessages((m) => {
        if (m.type === "tabMovedOut" && m.panel === panel) closeMoved(panel, m.key, m.kind);
      }),
    [panel],
  );
}
