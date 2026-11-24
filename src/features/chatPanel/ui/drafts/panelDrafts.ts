import { useMemo, useSyncExternalStore } from "react";
import { navigate } from "@/foundation/ui/navigation/router";
import { defineNewProjectAfter } from "@/features/projects/ui";
import type { DraftRef, DraftTabSpot } from "@/features/chatList/ui";
import { paneOfTab, type SplitDir } from "@/features/panel/ui/layout/paneTree";
import {
  dispatchPanel,
  forwardPanelOp,
  isPanelMounted,
  newChatTab,
  newTabKey,
  openTab,
  panelScreen,
  panelStateOf,
  panelsVersion,
  restorePanelTabs,
  showTab,
  splitPane,
  type TabGroupBadge,
  type TabGroupLookup,
} from "@/features/panel/ui";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";
import { chatsPanel, type NewChatSeed } from "@/features/chat/ui";
import {
  createNewChatDraft,
  discardNewChatDraft,
  draftTitleOf,
  newChatDraft,
  patchNewChatDraft,
  readNewChatDrafts,
  subscribeNewChatDrafts,
  type NewChatDraft,
  type NewChatDraftTarget,
} from "@/features/composer/ui";
import { draftTabPlaces, draftTabSpot, followedPanels, subscribeFollowedPanels, type PanelFollowSnapshot } from "@/features/chatPanel/ui/panelFollow";

/**
 * 開いている送る前の新しいチャット（composer の店の下書きと、そのタブのある欄・その欄で表示しているか）。
 * サイドバー・ボードの「下書き」の列・⌘⇧A で共通の形。このウィンドウの欄にタブがある下書きだけ
 */
export interface PlacedDraft extends NewChatDraft {
  /** タブのある欄（surface.ts の panelKey） */
  panel: string;
  /** その欄で表示しているか（欄が開いていて、どれかのペインで表示中。ボードのカードを選択中に見せる） */
  showing: boolean;
  /** サイドバーの「固定」に出すか */
  pinned: boolean;
}

export { draftTitleOf };

/** 下書きを指す値（ドラッグで渡す。どの欄のパネルの、どのタブか。タブのキーは下書きのキー） */
export type { DraftRef };

/** 下書きを指す値だけを取り出す（サイドバーの別ウィンドウからメインのウィンドウに頼むとき） */
const refOf = (draft: DraftRef): DraftRef => ({ panel: draft.panel, key: draft.key });

/** 送る前の添付があるか */
export const hasDraftAttachments = (draft: Pick<NewChatDraft, "attachments">) => (draft.attachments ?? []).length > 0;

/** 下書きの作成先のグループ（プロジェクトのグループになければ、分かっているグループ名だけ） */
export function draftGroupOf(key: string, groupOf: TabGroupLookup): TabGroupBadge | undefined {
  const draft = newChatDraft(key);
  if (!draft) return undefined;
  return groupOf(draft.projectId, draft.group) ?? (draft.groupName ? { name: draft.groupName, hue: null } : undefined);
}

let snapshot: { drafts: readonly NewChatDraft[]; version: number | PanelFollowSnapshot; list: PlacedDraft[] } | undefined;

/**
 * いまの下書きと置き場所（並びは欄・タブの並び。下書きの店もタブの置き場所も変わるまでは同じ配列を返す。下書きを使う部品を、ほかのパネルの操作のたびに描き直さない）。
 * サイドバーの別ウィンドウでは、置き場所はメインのウィンドウからの写し
 */
export function placedDrafts(): PlacedDraft[] {
  const drafts = readNewChatDrafts();
  const followed = followedPanels();
  const version = followed ?? panelsVersion();
  if (snapshot?.drafts === drafts && snapshot.version === version) return snapshot.list;
  const byKey = new Map(drafts.map((d) => [d.key, d]));
  const list = (followed?.drafts ?? draftTabPlaces()).flatMap((place) => {
    const draft = byKey.get(place.key);
    return draft ? [{ ...draft, panel: place.panel, showing: place.showing, pinned: draft.pinned === true }] : [];
  });
  const prev = snapshot?.drafts === drafts ? snapshot.list : undefined;
  const same = prev !== undefined && prev.length === list.length && prev.every((d, i) => d.key === list[i].key && d.panel === list[i].panel && d.showing === list[i].showing);
  snapshot = { drafts, version, list: same ? prev : list };
  return snapshot.list;
}

const subscribeDrafts = (listener: () => void) => {
  const offPanels = subscribeFollowedPanels(listener);
  const offDrafts = subscribeNewChatDrafts(listener);
  return () => {
    offPanels();
    offDrafts();
  };
};

/** パネルのタブが下書きなら、その下書き（タブの右クリックのメニュー。表示しているかは見ない） */
export function draftOfPanelTab(panel: string, tab: PanelTab | undefined): PlacedDraft | undefined {
  const draft = tab?.kind === "new" ? newChatDraft(tab.key) : undefined;
  return draft && { ...draft, panel, showing: false, pinned: draft.pinned === true };
}

/** すべての欄の下書き（サイドバー・⌘⇧A） */
export function useAllDrafts(): PlacedDraft[] {
  return useSyncExternalStore(subscribeDrafts, placedDrafts);
}

/** 渡した欄のパネルの下書き（ボード: そのボードのパネルと、同じプロジェクトのチャット欄。下書きが変わるまでは同じ配列） */
export function useDraftsInPanels(panels: readonly string[]): PlacedDraft[] {
  const all = useAllDrafts();
  // panels は中身（sig）が変わったときだけ選び直す（配列を毎回作って渡しても、同じ配列を返す）
  const sig = JSON.stringify(panels);
  return useMemo(() => {
    const wanted = JSON.parse(sig) as string[];
    return all.filter((d) => wanted.includes(d.panel));
  }, [all, sig]);
}

/** 新しいチャットのタブを最後に開いたもの（欄ごと。開発時の effect の二重実行で、同じタブを 2 つ開かないように） */
const lastNew = new Map<string, { target: string; key: string; at: number }>();

/**
 * 新しいチャット（下書き）を作ってタブを開き、そのキーを返す（ボードや列・グループの＋、サイドバーの＋など）。押すたびに新しい下書きを作る
 * （書きかけの新しいチャットがあっても、もう 1 つ始められる）。seed は初めに入力欄に入れるもの（送信待ちの指示から始めたとき）、fields は初めの中身
 */
export function openNewChat(panel: string, target: NewChatDraftTarget, seed?: NewChatSeed, fields?: Parameters<typeof createNewChatDraft>[3]): string {
  // 同じ指定でほぼ同時に呼ばれたとき（開発時の effect の二重実行）だけ 1 つにまとめる（初めの入力があるものは利用者の操作なのでまとめない）
  const sig = `${target.projectId}:${target.group ?? ""}:${target.worktree ?? ""}`;
  const recent = lastNew.get(panel);
  const key = !seed && recent && recent.target === sig && Date.now() - recent.at < 100 ? recent.key : newTabKey("new");
  lastNew.set(panel, { target: sig, key, at: Date.now() });
  createNewChatDraft(key, target, seed, fields);
  openTab(panel, newChatTab(key));
  return key;
}

/** 前回残した下書きを、作成先のプロジェクトのチャットのパネルの閉じたタブとして戻す（起動したとき 1 回。チャットの別ウィンドウにあったものも） */
export function restoreDraftTabs(): void {
  const byPanel = new Map<string, PanelTab[]>();
  for (const d of readNewChatDrafts()) {
    const panel = chatsPanel(d.projectId);
    byPanel.set(panel, [...(byPanel.get(panel) ?? []), newChatTab(d.key)]);
  }
  for (const [panel, tabs] of byPanel) restorePanelTabs(panel, tabs);
}

/**
 * 下書きのタブの、その欄の一覧のペインでの位置（draftTabSpot。サイドバーの手動の並びで下書きの行を置く）。
 * タブの列が変わったときだけ新しい配列にする（位置は文字にして比べる）。on でなければ読まず空
 */
export function useDraftTabSpots(drafts: readonly DraftRef[], on: boolean): readonly (DraftTabSpot | null)[] {
  const sig = useSyncExternalStore(subscribeFollowedPanels, () => {
    if (!on) return "";
    const followed = followedPanels();
    return JSON.stringify(drafts.map((d) => (followed ? (followed.spots[d.key] ?? null) : draftTabSpot(d))));
  });
  return useMemo(() => (sig === "" ? [] : (JSON.parse(sig) as (DraftTabSpot | null)[])), [sig]);
}

/** 下書きを開く。その欄が画面になければ、その画面（ボード・チャット欄ならそのプロジェクト）へ移ってから開く */
export function openDraft(draft: DraftRef) {
  if (forwardPanelOp({ op: "openDraft", draft: refOf(draft) }, { focusMain: true })) return;
  const screen = isPanelMounted(draft.panel) ? undefined : panelScreen(draft.panel);
  if (screen) navigate(screen);
  showTab(draft.panel, draft.key);
}

/**
 * 下書きを、その欄で右・下に分けて開く（サイドバー・ボードの右クリック。チャットの「右に分けて開く」と同じく、タブを開いてから新しいペインへ移す。
 * タブの右クリックは、そのタブのペインを分ける）
 */
export function openDraftSplit(draft: DraftRef, dir: SplitDir) {
  if (forwardPanelOp({ op: "openDraftSplit", draft: refOf(draft), dir }, { focusMain: true })) return;
  openDraft(draft);
  const pane = paneOfTab(panelStateOf(draft.panel).layout, draft.key);
  if (pane) splitPane(draft.panel, pane.id, dir, "after", draft.key);
}

/** 下書きに名前を付ける（空なら外して「New Chat」に戻す） */
export function setDraftTitle(draft: DraftRef, title: string) {
  if (forwardPanelOp({ op: "setDraftTitle", draft: refOf(draft), title })) return;
  patchNewChatDraft(draft.key, { title: title.trim() || undefined });
}

/**
 * 下書きを別のプロジェクトへ移す（右クリックの「プロジェクトを変更」）。書きかけの文・送る前の添付・名前・固定はそのままに、
 * 移す先のプロジェクトのチャットのパネルで新しいチャットとして開き直し、元の下書きは消す（グループ・作業場所はプロジェクトごとなので、移す先の本体・グループなしから）
 */
export function moveDraftToProject(draft: DraftRef, projectId: number) {
  if (forwardPanelOp({ op: "moveDraftToProject", draft: refOf(draft), projectId }, { focusMain: true })) return;
  const from = newChatDraft(draft.key);
  if (!from || from.projectId === projectId) return;
  const panel = chatsPanel(projectId);
  // 送信待ちから始めたとき（seed）の案内は出さないよう、書きかけの文と添付は下書きの中身として入れる
  const key = openNewChat(panel, { projectId }, undefined, { text: from.text, attachments: from.attachments, title: from.title, pinned: from.pinned });
  // 元のタブを閉じると元の欄の表示中のタブが変わるが、URL はもう移る先の画面なので、元の欄は URL を書き換えない（board/shownTabUrl.ts）
  openDraft({ panel, key });
  discardDraft(draft);
}

/** 下書きの作成先のグループを変える（サイドバーでグループへドラッグしたとき。undefined ならグループなし） */
export function setDraftGroup(draft: DraftRef, group: number | undefined, groupName: string | undefined) {
  if (forwardPanelOp({ op: "setDraftGroup", draft: refOf(draft), group, groupName })) return;
  patchNewChatDraft(draft.key, { group, groupName });
}

/** 下書きの固定を付け外しする（サイドバーの「固定」に出す。外したら pinned を残さない） */
export function togglePinDraft(draft: DraftRef & Pick<PlacedDraft, "pinned">) {
  if (forwardPanelOp({ op: "togglePinDraft", draft: refOf(draft), pinned: draft.pinned })) return;
  patchNewChatDraft(draft.key, { pinned: draft.pinned ? undefined : true });
}

/** 下書きを消す（タブを閉じる。閉じたタブの後始末で下書きも消えるが、タブがなくても消す） */
export function discardDraft(draft: DraftRef) {
  if (forwardPanelOp({ op: "discardDraft", draft: refOf(draft) })) return;
  dispatchPanel(draft.panel, { type: "close", keys: [draft.key], dismiss: false });
  discardNewChatDraft(draft.key);
}

/**
 * もうないプロジェクトの下書きを消す（下書きは再起動しても残すので、プロジェクトを消したあとも残り続けないように）。
 * 一覧がまだ届いていない（空の）ときは何もしない
 */
export function forgetDraftsOfMissingProjects(projectIds: ReadonlySet<number>) {
  if (projectIds.size === 0) return;
  const placed = new Map(placedDrafts().map((d) => [d.key, d.panel]));
  for (const d of readNewChatDrafts()) if (!projectIds.has(d.projectId)) discardDraft({ panel: placed.get(d.key) ?? chatsPanel(d.projectId), key: d.key });
}

declare module "@/features/projects/ui/new/openNewProject" {
  interface NewProjectAfterMap {
    /** その下書きを作ったプロジェクトへ移す（下書きのメニューの「プロジェクトを変更」→「新規プロジェクト」） */
    moveDraft: { draft: DraftRef };
  }
}

/** 新しいプロジェクトを作ったあとに、頼んだ下書きをそこへ移す（projects の newProjectAfters に登録する） */
export const moveDraftAfterNewProject = defineNewProjectAfter("moveDraft", (after, project) => moveDraftToProject(after.draft, project.id));
