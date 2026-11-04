import { useSyncExternalStore } from "react";
import { navigate } from "../../router";
import { activeTabOf, closeLayoutTabs, reconcileLayout, singlePane, type PaneLayout } from "./paneLayout";
import { readSavedDrafts, writeDrafts } from "./draftPersistence";
import { NO_LINKS, type LinkState } from "./linkedTabs";
import type { PanelTab } from "./useSidePanel";

/**
 * パネルの状態（ボードごと）。layout は分割の配置（タブのキーを指す）。分割を覚える前の形（layout なし）は、
 * すべてのタブが入った 1 つのペイン（activeTab を表示中）として読む。activeTab はピントのあるペインの表示中のタブ
 */
interface PanelState {
  tabs: PanelTab[];
  activeTab: string | null;
  panelOpen: boolean;
  layout?: PaneLayout;
  /** サイドバーと連動したチャットのタブの覚え（表示だけ消したもの・一覧にないのに開いたもの） */
  links?: LinkState;
}

/**
 * ボードごとの、開いているタブとパネルの開閉。ボードとエディタなどのタブを切り替えると、ボードの部品は作り直されるので、
 * 戻ってきたときに元どおりにできるよう、ここに覚えておく（アプリを閉じるまで。送る前の新しいチャットのタブだけは
 * draftPersistence で localStorage にも残し、起動したら閉じたパネルのタブとして戻す）。
 * キーは kanban:<プロジェクト | all>（ボード。列を状態で分けても・グループで分けても同じパネル。boardPanelKey）/
 * side:<プロジェクト>（プロジェクトのチャット欄）
 */
const panelMemory = new Map<string, PanelState>(
  [...readSavedDrafts()].map(([memoryKey, tabs]) => [memoryKey, { tabs, activeTab: null, panelOpen: false }]),
);

/** ボード（カンバン・グループのボード）の右のパネルを覚える名前。列の分け方（状態 / グループ）を切り替えても、開閉・タブ・分割はそのまま */
export const boardPanelKey = (projectId?: number) => `kanban:${projectId ?? "all"}`;
const EMPTY_PANEL: PanelState = { tabs: [], activeTab: null, panelOpen: false };

const listeners = new Set<() => void>();
let version = 0;

/** 覚えている状態。配置は、いまのタブに合わせて直してから返す（消えたタブ・どのペインにもないタブがあっても壊れない） */
export function loadPanel(memoryKey: string): Required<PanelState> {
  const s = panelMemory.get(memoryKey) ?? EMPTY_PANEL;
  const keys = s.tabs.map((t) => t.key);
  const layout = s.layout ? reconcileLayout(s.layout, keys) : singlePane(keys, s.activeTab);
  return { ...s, layout, activeTab: activeTabOf(layout), links: s.links ?? NO_LINKS };
}

export function savePanel(memoryKey: string, state: PanelState) {
  panelMemory.set(memoryKey, state);
  writeDrafts([...panelMemory].map(([k, s]) => [k, s.tabs]));
  version++;
  listeners.forEach((l) => l());
}

// いま画面に出ているパネルの、タブを表示する・閉じる・中身を変える方法（サイドバーの下書きから使う）
interface PanelOpener {
  show: (tabKey: string) => void;
  close: (tabKey: string) => void;
  update: (tabKey: string, change: (tab: PanelTab) => PanelTab) => void;
}
const openers = new Map<string, PanelOpener>();

/** 画面に出ているパネルを登録する（やめるときは返り値を呼ぶ。あとから登録したもの（プロジェクトのチャット欄の欄ごと開く方法など）が優先） */
export function registerPanel(memoryKey: string, opener: PanelOpener): () => void {
  openers.set(memoryKey, opener);
  return () => {
    if (openers.get(memoryKey) === opener) openers.delete(memoryKey);
  };
}

/** 送る前の新しいチャット（どのボード・チャット欄で書いているか） */
export interface SidebarDraft {
  memoryKey: string;
  key: string;
  projectId: number;
  group?: number;
  text: string;
}

/** すべてのボード・チャット欄の下書き（サイドバーに出す） */
export function useAllDrafts(): SidebarDraft[] {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return draftsSnapshot();
}

/** 下書きを開く。そのパネルが画面になければ、そのボード（チャット欄ならそのプロジェクト）へ移ってから開く */
export function openDraft(draft: SidebarDraft) {
  const live = openers.get(draft.memoryKey);
  if (live) return live.show(draft.key);
  const [kind, id] = draft.memoryKey.split(":");
  if (kind === "kanban" && id === "all") navigate({ name: "allProjects" });
  else navigate({ name: "project", id: Number(id), tab: "board" });
  // 移った先のパネルが出るのを待って開く（出なければあきらめる）
  let tries = 0;
  const timer = setInterval(() => {
    const opener = openers.get(draft.memoryKey);
    if (opener || ++tries > 40) {
      clearInterval(timer);
      opener?.show(draft.key);
    }
  }, 50);
}

/** 下書きを指す値（ドラッグで渡す。どのボード・チャット欄の、どのタブか） */
export type DraftRef = Pick<SidebarDraft, "memoryKey" | "key">;

/**
 * 下書きの作成先のグループを変える（サイドバーでグループへドラッグしたとき。undefined ならグループなし）。
 * そのパネルが画面になければ、覚えている内容を書き換える
 */
export function setDraftGroup(draft: DraftRef, group: number | undefined, groupName: string | undefined) {
  const change = (t: PanelTab): PanelTab => (t.kind === "new" && t.key === draft.key ? { ...t, group, groupName } : t);
  const live = openers.get(draft.memoryKey);
  if (live) return live.update(draft.key, change);
  if (!panelMemory.has(draft.memoryKey)) return;
  const s = loadPanel(draft.memoryKey);
  savePanel(draft.memoryKey, { ...s, tabs: s.tabs.map(change) });
}

/** 下書きを消す（そのパネルが画面になければ、覚えている内容から消す） */
export function discardDraft(draft: SidebarDraft) {
  const live = openers.get(draft.memoryKey);
  if (live) return live.close(draft.key);
  if (!panelMemory.has(draft.memoryKey)) return;
  const s = loadPanel(draft.memoryKey);
  const tabs = s.tabs.filter((t) => t.key !== draft.key);
  const layout = closeLayoutTabs(s.layout, [draft.key]);
  savePanel(draft.memoryKey, { ...s, tabs, layout, activeTab: activeTabOf(layout), panelOpen: s.panelOpen && tabs.length > 0 });
}

/**
 * もうないプロジェクトの下書きを消す（下書きは再起動しても残すので、プロジェクトを消したあとも残り続けないように）。
 * 一覧がまだ届いていない（空の）ときは何もしない
 */
export function forgetDraftsOfMissingProjects(projectIds: ReadonlySet<number>) {
  if (projectIds.size === 0) return;
  draftsSnapshot()
    .filter((d) => !projectIds.has(d.projectId))
    .forEach(discardDraft);
}

function draftsSnapshot(): SidebarDraft[] {
  return [...panelMemory].flatMap(([memoryKey, s]) =>
    s.tabs.flatMap((t) => (t.kind === "new" ? [{ memoryKey, key: t.key, projectId: t.projectId, group: t.group, text: t.draftText ?? "" }] : [])),
  );
}
