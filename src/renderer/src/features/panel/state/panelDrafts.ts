import { useMemo, useSyncExternalStore } from "react";
import { navigate } from "@/app/router";
import { NEW_CHAT_TITLE } from "@/features/chat/chatTitle";
import type { DraftTarget } from "@/features/chatList/buckets";
import type { DraftTabSpot } from "@/features/chatList/manualOrder";
import { homePane, isTabVisible, paneOfTab, type SplitDir } from "@/features/panel/layout/paneTree";
import { panelKey, panelScreen } from "@/features/panel/surfaces";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";
import { panelActions } from "./panelActions";
import { allPanels, dispatchPanel, isPanelMounted, panelStateOf, panelsVersion, subscribePanels } from "./panelStore";

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
  /** 送る前に付けた名前（右クリックの「名前を変更」。送ったらその名前のチャットになる。なければ「New Chat」） */
  title?: string;
}

/** 下書きの名前（付けていなければ「New Chat」。タブ・サイドバー・ボード・⌘⇧A で同じ） */
export const draftTitleOf = (draft: Pick<PanelDraft, "title">) => draft.title ?? NEW_CHAT_TITLE;

/** 下書きを指す値（ドラッグで渡す。どの欄のパネルの、どのタブか） */
export type DraftRef = Pick<PanelDraft, "panel" | "key">;

const NO_DRAFTS: PanelDraft[] = [];
let snapshot: { version: number; list: PanelDraft[] } | undefined;

const sameDraft = (a: PanelDraft, b: PanelDraft) =>
  a.panel === b.panel &&
  a.key === b.key &&
  a.projectId === b.projectId &&
  a.group === b.group &&
  a.worktree === b.worktree &&
  a.text === b.text &&
  a.showing === b.showing &&
  a.pinned === b.pinned &&
  a.title === b.title;

/** 新しいチャットのタブの下書き（showing はその欄で表示しているか） */
const draftOfTab = (panel: string, t: Extract<PanelTab, { kind: "new" }>, showing: boolean): PanelDraft => ({
  panel,
  key: t.key,
  projectId: t.projectId,
  group: t.group,
  worktree: t.worktree,
  text: t.draftText ?? "",
  showing,
  pinned: t.pinned === true,
  title: t.title,
});

/** パネルのタブが下書きなら、その下書き（タブの右クリックのメニュー。表示しているかは見ない） */
export const draftOfPanelTab = (panel: string, tab: PanelTab | undefined): PanelDraft | undefined => (tab?.kind === "new" ? draftOfTab(panel, tab, false) : undefined);

/** いまの下書き（中身が変わるまでは同じ配列を返す。下書きを使う部品を、ほかのパネルの操作のたびに描き直さない） */
export function currentDrafts(): PanelDraft[] {
  const version = panelsVersion();
  if (snapshot?.version === version) return snapshot.list;
  const list = [...allPanels()].flatMap(([panel, s]) => s.tabs.flatMap((t) => (t.kind === "new" ? [draftOfTab(panel, t, s.open && isTabVisible(s.layout, t.key))] : [])));
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

/**
 * 下書きを、その欄で右・下に分けて開く（サイドバー・ボードの右クリック。チャットの「右に分けて開く」と同じく、タブを開いてから新しいペインへ移す。
 * タブの右クリックは、そのタブのペインを分ける）
 */
export function openDraftSplit(draft: DraftRef, dir: SplitDir) {
  openDraft(draft);
  const pane = paneOfTab(panelStateOf(draft.panel).layout, draft.key);
  if (pane) panelActions(draft.panel).splitPane(pane.id, dir, "after", draft.key);
}

/** 下書きに名前を付ける（空なら外して「New Chat」に戻す） */
export function setDraftTitle(draft: DraftRef, title: string) {
  dispatchPanel(draft.panel, { type: "patch", key: draft.key, kind: "new", fields: { title: title.trim() || undefined } });
}

/**
 * 下書きを別のプロジェクトへ移す（右クリックの「プロジェクトを変更」）。書きかけの文・送る前の添付・名前・固定はそのままに、
 * 移す先のプロジェクトのチャットのパネルで新しいチャットとして開き直し、元の下書きは消す（グループ・作業場所はプロジェクトごとなので、移す先の本体・グループなしから）
 */
export function moveDraftToProject(draft: DraftRef, projectId: number) {
  const tab = allPanels().get(draft.panel)?.tabs.find((t) => t.key === draft.key);
  if (tab?.kind !== "new" || tab.projectId === projectId) return;
  const panel = panelKey("board", projectId);
  // 送信待ちから始めたとき（seed）の案内は出さないよう、書きかけの文と添付はタブにそのまま入れる（入力欄は開いたときにタブから戻す）
  const key = panelActions(panel).openNew({ projectId });
  dispatchPanel(panel, { type: "patch", key, kind: "new", fields: { draftText: tab.draftText, draftAttachments: tab.draftAttachments, title: tab.title, pinned: tab.pinned } });
  // 先に移す先を開いてから元を消す（先に消すと、元の欄が表示中のタブの変わったことを URL にして、移る先の画面を上書きする）
  openDraft({ panel, key });
  discardDraft(draft);
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
