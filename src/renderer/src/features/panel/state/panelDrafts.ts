import { useMemo, useSyncExternalStore } from "react";
import { navigate } from "@/app/router";
import type { DraftTarget } from "@/features/chatList/buckets";
import type { DraftTabSpot } from "@/features/chatList/manualOrder";
import { homePane, isTabVisible } from "@/features/panel/layout/paneTree";
import { panelScreen } from "@/features/panel/surfaces";
import { panelActions } from "./panelActions";
import { allPanels, dispatchPanel, isPanelMounted, panelsVersion, subscribePanels } from "./panelStore";

/**
 * 送る前の新しいチャット（下書き）。どの欄のパネルのどのタブか・作成先・書きかけの文・その欄で表示しているか
 * （サイドバー・ボードの「下書き」の列・⌘⇧A で共通の形）
 */
export interface PanelDraft extends DraftTarget {
  /** 欄のパネル（surfaces.ts の panelKey） */
  panel: string;
  /** タブのキー */
  key: string;
  /** 書いている途中の文 */
  text: string;
  /** その欄で表示しているか（欄が開いていて、どれかのペインで表示中。ボードのカードを選択中に見せる） */
  showing: boolean;
  /** サイドバーの「固定」に出すか（送ったら、できたチャットも固定する） */
  pinned: boolean;
}

/** 下書きを指す値（ドラッグで渡す。どの欄のパネルの、どのタブか） */
export type DraftRef = Pick<PanelDraft, "panel" | "key">;

const NO_DRAFTS: PanelDraft[] = [];
let snapshot: { version: number; list: PanelDraft[] } | undefined;

const sameDraft = (a: PanelDraft, b: PanelDraft) =>
  a.panel === b.panel && a.key === b.key && a.projectId === b.projectId && a.group === b.group && a.text === b.text && a.showing === b.showing && a.pinned === b.pinned;

/** いまの下書き（中身が変わるまでは同じ配列を返す。下書きを使う部品を、ほかのパネルの操作のたびに描き直さない） */
export function currentDrafts(): PanelDraft[] {
  const version = panelsVersion();
  if (snapshot?.version === version) return snapshot.list;
  const list = [...allPanels()].flatMap(([panel, s]) =>
    s.tabs.flatMap((t) =>
      t.kind === "new" ? [{ panel, key: t.key, projectId: t.projectId, group: t.group, text: t.draftText ?? "", showing: s.open && isTabVisible(s.layout, t.key), pinned: t.pinned === true }] : [],
    ),
  );
  const prev = snapshot?.list;
  const same = prev !== undefined && prev.length === list.length && prev.every((d, i) => sameDraft(d, list[i]));
  snapshot = { version, list: same ? prev : list.length === 0 ? NO_DRAFTS : list };
  return snapshot.list;
}

/** すべての欄の下書き（サイドバー・⌘⇧A） */
export function useAllDrafts(): PanelDraft[] {
  return useSyncExternalStore(subscribePanels, currentDrafts);
}

/** 渡した欄のパネルの下書き（ボード: そのボードのパネルと、同じプロジェクトのチャット欄。下書きが変わるまでは同じ配列） */
export function usePanelDrafts(panels: readonly string[]): PanelDraft[] {
  const all = useAllDrafts();
  const sig = panels.join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- panels は中身（sig）が変わったときだけ
  return useMemo(() => all.filter((d) => panels.includes(d.panel)), [all, sig]);
}

/**
 * 下書きのタブの、その欄の一覧のペイン（サイドバーと連動したチャットのタブが入るペイン）での位置（サイドバーの手動の並びで、下書きの行を
 * タブの位置に合わせる。利用者の依頼）。一覧のペインにない（分けたペインへ移した）なら null
 */
export function draftTabSpot(draft: DraftRef): DraftTabSpot | null {
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

/** 下書きを開く。その欄が画面になければ、その画面（ボード・チャット欄ならそのプロジェクト）へ移ってから開く */
export function openDraft(draft: DraftRef) {
  const screen = isPanelMounted(draft.panel) ? undefined : panelScreen(draft.panel);
  if (screen) navigate(screen);
  panelActions(draft.panel).showTab(draft.key);
}

/** 下書きの作成先のグループを変える（サイドバーでグループへドラッグしたとき。undefined ならグループなし） */
export function setDraftGroup(draft: DraftRef, group: number | undefined, groupName: string | undefined) {
  dispatchPanel(draft.panel, { type: "patch", key: draft.key, kind: "new", fields: { group, groupName } });
}

/** 下書きの固定を付け外しする（サイドバーの「固定」に出す。外したら pinned を残さない） */
export function togglePinDraft(draft: DraftRef & Pick<PanelDraft, "pinned">) {
  dispatchPanel(draft.panel, { type: "patch", key: draft.key, kind: "new", fields: { pinned: draft.pinned ? undefined : true } });
}

/** 下書きを消す */
export function discardDraft(draft: DraftRef) {
  dispatchPanel(draft.panel, { type: "close", keys: [draft.key], dismiss: false });
}

/**
 * もうないプロジェクトの下書きを消す（下書きは再起動しても残すので、プロジェクトを消したあとも残り続けないように）。
 * 一覧がまだ届いていない（空の）ときは何もしない
 */
export function forgetDraftsOfMissingProjects(projectIds: ReadonlySet<number>) {
  if (projectIds.size === 0) return;
  currentDrafts()
    .filter((d) => !projectIds.has(d.projectId))
    .forEach(discardDraft);
}
