import { useSyncExternalStore } from "react";
import { navigate } from "../../router";
import type { PanelTab } from "./useSidePanel";

/** パネルの状態（ボードごと） */
export interface PanelState {
  tabs: PanelTab[];
  activeTab: string | null;
  panelOpen: boolean;
}

/**
 * ボードごとの、開いているタブとパネルの開閉。カンバンとグループのタブを切り替えると、ボードの部品は作り直されるので、
 * 戻ってきたときに元どおりにできるよう、ここに覚えておく（アプリを閉じるまで）。
 * キーは kanban:<プロジェクト | all> / groups:<プロジェクト> / side:<プロジェクト>（プロジェクトのチャット欄）
 */
const panelMemory = new Map<string, PanelState>();
export const EMPTY_PANEL: PanelState = { tabs: [], activeTab: null, panelOpen: false };

const listeners = new Set<() => void>();
let version = 0;

export const loadPanel = (memoryKey: string) => panelMemory.get(memoryKey) ?? EMPTY_PANEL;

export function savePanel(memoryKey: string, state: PanelState) {
  panelMemory.set(memoryKey, state);
  version++;
  listeners.forEach((l) => l());
}

// いま画面に出ているパネルの、タブを表示する・閉じる方法（サイドバーの下書きから使う）
interface PanelOpener {
  show: (tabKey: string) => void;
  close: (tabKey: string) => void;
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
  return [...panelMemory].flatMap(([memoryKey, s]) =>
    s.tabs.flatMap((t) => (t.kind === "new" ? [{ memoryKey, key: t.key, projectId: t.projectId, group: t.group, text: t.draftText ?? "" }] : [])),
  );
}

/** 下書きを開く。そのパネルが画面になければ、そのボード（チャット欄ならそのプロジェクト）へ移ってから開く */
export function openDraft(draft: SidebarDraft) {
  const live = openers.get(draft.memoryKey);
  if (live) return live.show(draft.key);
  const [kind, id] = draft.memoryKey.split(":");
  if (kind === "groups") navigate({ name: "project", id: Number(id), tab: "groups" });
  else if (kind === "kanban" && id === "all") navigate({ name: "allProjects" });
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

/** 下書きを消す（そのパネルが画面になければ、覚えている内容から消す） */
export function discardDraft(draft: SidebarDraft) {
  const live = openers.get(draft.memoryKey);
  if (live) return live.close(draft.key);
  const s = panelMemory.get(draft.memoryKey);
  if (!s) return;
  const tabs = s.tabs.filter((t) => t.key !== draft.key);
  savePanel(draft.memoryKey, { tabs, activeTab: s.activeTab === draft.key ? (tabs[0]?.key ?? null) : s.activeTab, panelOpen: s.panelOpen && tabs.length > 0 });
}
