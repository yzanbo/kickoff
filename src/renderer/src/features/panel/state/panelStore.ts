import { useEffect, useSyncExternalStore } from "react";
import { subscribeServerEvent } from "@/api/events";
import { readSetting, writeSetting } from "@/lib/storage";
import { parsePanelKey, SURFACES } from "@/features/panel/surfaces";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";
import { readSavedDrafts, writeDrafts } from "./draftPersistence";
import { kindOfTab, readKinds } from "./panelKinds";
import { emptyPanel, panelReducer, type PanelAction, type PanelRules, type PanelState } from "./panelState";

/**
 * 欄のパネルの状態を、欄・画面ごと（surfaces.ts の panelKey）に覚えておく店。ボードとエディタなどのタブを切り替えると欄の部品は
 * 作り直されるので、戻ってきたときに元どおりにできるよう、部品ではなくここで持つ（アプリを閉じるまで。送る前の新しいチャットのタブだけは
 * draftPersistence で localStorage にも残し、起動したら閉じた欄のタブとして戻す。チャット欄の開閉はプロジェクトごとに覚える）。
 * 部品は usePanelState で読み、dispatchPanel で変える（画面に出ていない欄も、サイドバーの下書きなどから同じ方法で変えられる）
 */
const states = new Map<string, PanelState>();
const listeners = new Set<() => void>();
let version = 0;

/** 開いているかを覚える欄（チャット欄）の、その画面の設定 */
function openSettingOf(key: string) {
  const at = parsePanelKey(key);
  const setting = at && SURFACES[at.surface].openSetting;
  return setting && typeof at.scope === "number" ? setting(at.scope) : undefined;
}

/** 欄の初めの状態（開いているかを覚える欄は、覚えた値から） */
function initialState(key: string, tabs: readonly PanelTab[] = []): PanelState {
  const setting = openSettingOf(key);
  return emptyPanel(tabs, setting ? readSetting(setting) : false);
}

// 前回残した下書きのタブを、閉じた欄のタブとして戻す
for (const [key, tabs] of readSavedDrafts()) states.set(key, initialState(key, tabs));

/** 欄のいまの状態（まだなければ初めの状態を作って覚える） */
export function panelStateOf(key: string): PanelState {
  let state = states.get(key);
  if (!state) states.set(key, (state = initialState(key)));
  return state;
}

/** すべての欄の状態（下書きの一覧に使う） */
export const allPanels = (): ReadonlyMap<string, PanelState> => states;

/** 状態が変わるたびに増える数（下書きの一覧を作り直すかを決める） */
export const panelsVersion = () => version;

/** 欄の決まり（見せている種類・最後のタブを閉じたら閉じるか） */
function rulesOf(key: string): PanelRules {
  const at = parsePanelKey(key);
  if (!at) return { shows: () => true, closeWhenEmpty: false };
  const kinds = readKinds(at.surface);
  return { shows: (t) => kinds.includes(kindOfTab(t)), closeWhenEmpty: SURFACES[at.surface].closeWhenEmpty };
}

/** 閉じたタブの後始末（ターミナルはシェルも止める。ブラウザの開発者ツールは、webview がなくなるときに BrowserPane が閉じる） */
function dispose(tab: PanelTab) {
  if (tab.kind === "terminal") void globalThis.window?.kickoff?.terminal.close(tab.key);
}

/**
 * 欄の状態を変える（panelReducer）。閉じたタブの後始末をし、下書きのタブ・開いているか（覚える欄だけ）を保存して、読んでいる部品に知らせる。
 * 変わらなければ何もしない
 */
export function dispatchPanel(key: string, action: PanelAction): void {
  const prev = panelStateOf(key);
  const next = panelReducer(prev, action, rulesOf(key));
  if (next === prev) return;
  states.set(key, next);
  if (next.tabs !== prev.tabs) {
    const kept = new Set(next.tabs.map((t) => t.key));
    prev.tabs.filter((t) => !kept.has(t.key)).forEach(dispose);
    writeDrafts([...states].map(([k, s]) => [k, s.tabs] as const));
  }
  const setting = next.open !== prev.open ? openSettingOf(key) : undefined;
  if (setting) writeSetting(setting, next.open);
  version++;
  for (const listener of [...listeners]) listener();
}

export function subscribePanels(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** 欄の状態を読む（変わったら描き直す） */
export function usePanelState(key: string): PanelState {
  return useSyncExternalStore(subscribePanels, () => panelStateOf(key));
}

/** 欄を開いているか（欄の殻が読む。key がなければ閉じている） */
export function usePanelOpen(key: string | undefined): boolean {
  return useSyncExternalStore(subscribePanels, () => (key === undefined ? false : panelStateOf(key).open));
}

// 画面に出ている欄（下書きを開くとき、出ていなければその画面へ移る）
const mounted = new Map<string, number>();

/** 欄が画面に出ている間、出ていることを知らせる */
export function useMountedPanel(key: string) {
  useEffect(() => {
    mounted.set(key, (mounted.get(key) ?? 0) + 1);
    return () => {
      const left = (mounted.get(key) ?? 1) - 1;
      if (left > 0) mounted.set(key, left);
      else mounted.delete(key);
    };
  }, [key]);
}

export const isPanelMounted = (key: string) => mounted.has(key);

// 削除したチャットのタブ（そのチャットのサブエージェントのタブも）は、どの欄でも閉じる（画面に出ていない欄も）
subscribeServerEvent((e) => {
  if (e.type !== "chat_deleted") return;
  for (const [key, state] of [...states]) {
    const gone = state.tabs.filter((t) => (t.kind === "chat" && t.id === e.id) || (t.kind === "subagent" && t.chatId === e.id));
    if (gone.length > 0) dispatchPanel(key, { type: "close", keys: gone.map((t) => t.key), dismiss: false });
  }
});
