// サイドバーの別ウィンドウへ写す、メインのウィンドウのパネルの要る値だけ（下書きのタブの欄と表示・一覧のペインでの位置・右の欄で見えている子チャット）。
// サイドバーの別ウィンドウの種類の follow（sidebar の ui/popoutKinds.ts）がこれを送り・受ける。受けている間、下書きと子チャットの行はこの写しから読む
import type { PopoutFollow } from "@/foundation/ui/navigation/popout";
import { createCell } from "@/foundation/ui/store";
import type { DraftTabSpot } from "@/features/chatList/ui";
import { allPanels, homePane, isTabVisible, leavesOf, parsePanelKey, setPanelReplica, subscribePanels, type PanelState } from "@/features/panel/ui";
import { chatSidePanel } from "@/features/chat/ui";

/** 下書きのタブの置き場所（タブのある欄と、その欄で表示しているか） */
export interface DraftTabPlace {
  key: string;
  panel: string;
  showing: boolean;
}

/** メインのウィンドウのパネルの写し */
export interface PanelFollowSnapshot {
  /** 下書きのタブ（欄・タブの並び） */
  drafts: readonly DraftTabPlace[];
  /** 下書きのキー → 一覧のペインでの位置（draftTabSpot） */
  spots: Readonly<Record<string, DraftTabSpot | null>>;
  /** いちばん上のチャットの ID → その右の欄で見えている子チャット（開いている欄だけ） */
  children: Readonly<Record<number, readonly number[]>>;
}

/** 受けている写し（null = このウィンドウのパネルから読む） */
const followed = createCell<PanelFollowSnapshot | null>(null);

const EMPTY: PanelFollowSnapshot = { drafts: [], spots: {}, children: {} };

/** 受けている写し（メインのウィンドウ・受けていないときは null） */
export const followedPanels = (): PanelFollowSnapshot | null => followed.get();

/** パネルか写しが変わったら listener を呼ぶ */
export function subscribeFollowedPanels(listener: () => void): () => void {
  const offPanels = subscribePanels(listener);
  const offFollowed = followed.subscribe(listener);
  return () => {
    offPanels();
    offFollowed();
  };
}

/** 欄の下書きのタブ（kind: "new"）の置き場所 */
export function draftTabPlaces(): DraftTabPlace[] {
  return [...allPanels()].flatMap(([panel, s]) => s.tabs.flatMap((t) => (t.kind === "new" ? [{ key: t.key, panel, showing: s.open && isTabVisible(s.layout, t.key) }] : [])));
}

/**
 * 下書きのタブの、その欄の一覧のペイン（サイドバーと連動したチャットのタブが入るペイン）での位置（サイドバーの手動の並びで、下書きの行を
 * タブの位置に合わせる）。一覧のペインにない（分けたペインへ移した）なら null
 */
export function draftTabSpot(draft: Pick<DraftTabPlace, "panel" | "key">): DraftTabSpot | null {
  const state = allPanels().get(draft.panel);
  if (!state) return null;
  const keys = homePane(state.layout).tabs;
  const at = keys.indexOf(draft.key);
  if (at < 0) return null;
  const ids = keys.map((key) => {
    const tab = state.tabs.find((t) => t.key === key);
    return tab?.kind === "chat" ? tab.id : null;
  });
  const chatIds = (list: (number | null)[]) => list.filter((id): id is number => id !== null);
  return { chatIds: chatIds(ids), before: chatIds(ids.slice(0, at)).length };
}

/** 右の欄で見えている子チャット（欄が閉じていれば空。分けたペインなら、それぞれの表のタブ） */
export function visibleChildIds(state: PanelState | undefined): number[] {
  if (!state?.open) return [];
  const shown = new Set(leavesOf(state.layout.root).map((p) => p.active));
  return state.tabs.flatMap((t) => (t.kind === "child" && shown.has(t.key) ? [t.childId] : []));
}

/** メインのウィンドウ: いまの写し */
export function panelFollowSnapshot(): PanelFollowSnapshot {
  const drafts = draftTabPlaces();
  const children: Record<number, number[]> = {};
  for (const [key, state] of allPanels()) {
    const scope = parsePanelKey(key)?.scope;
    if (typeof scope !== "number" || key !== chatSidePanel(scope)) continue;
    const ids = visibleChildIds(state);
    if (ids.length > 0) children[scope] = ids;
  }
  return { drafts, spots: Object.fromEntries(drafts.map((d) => [d.key, draftTabSpot(d)])), children };
}

/** サイドバーの別ウィンドウの種類の follow（受けている間、このウィンドウのパネルは変えない。変える操作はメインのウィンドウに頼む = forwardPanelOp） */
export const panelFollow: PopoutFollow = {
  publish: panelFollowSnapshot,
  watch: subscribePanels,
  begin() {
    setPanelReplica(true);
    followed.set(EMPTY);
    return () => {
      followed.set(null);
      setPanelReplica(false);
    };
  },
  apply: (snapshot) => followed.set(snapshot as PanelFollowSnapshot),
};
