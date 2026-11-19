import { useEffect, useSyncExternalStore } from "react";
import { subscribeServerEvent } from "@/foundation/ui/api/events";
import { readSetting, writeSetting } from "@/foundation/ui/storage/settings";
import { draftScope, panelKey, parsePanelKey, SURFACES } from "@/features/panel/ui/surfaces";
import { specOf } from "@/features/panel/ui/tabs/tabKinds";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";
import { readBrowserSession, writeBrowserSession } from "@/features/browser/ui/panel/browserSession";
import { moveDraftsToChatPanels, readSavedDrafts, writeDrafts } from "@/features/composer/ui/drafts/draftPersistence";
import { emptyPanel, panelReducer, type PanelAction, type PanelRules, type PanelState } from "./panelState";

/**
 * 欄のパネルの状態を、欄・画面ごと（surfaces.ts の panelKey）に覚えておく店。ボードとエディタなどのタブを切り替えると欄の部品は
 * 作り直されるので、戻ってきたときに元どおりにできるよう、部品ではなくここで持つ（原則アプリを閉じるまで）。
 * 送る前の新しいチャットと、右サイドバーのブラウザのタブ・配置・欄の開閉は localStorage にも残す。
 * 部品は usePanelState で読み、dispatchPanel で変える（画面に出ていない欄も、サイドバーの下書きなどから同じ方法で変えられる）
 */
const states = new Map<string, PanelState>();
const listeners = new Set<() => void>();
let version = 0;
/**
 * 写しか（サイドバーの別ウィンドウ。メインのウィンドウのパネルの状態を replacePanels で受け取って読むだけで、自分では変えない。
 * 変える操作はメインのウィンドウに頼む。panelMirror.ts）
 */
let replica = false;
/** このウィンドウが持つ欄か（下書き・ブラウザの保存で、ほかのウィンドウが持つ欄の分は書き換えない。panelHandOff.ts） */
let owns: (key: string) => boolean = (key) => !isWindowPanel(key);

/** タブの列のある別ウィンドウの欄か（その別ウィンドウが持つので、メインのウィンドウは下書きの保存で書き換えない） */
function isWindowPanel(key: string): boolean {
  const surface = parsePanelKey(key)?.surface;
  return surface === "window" || surface === "chatWindow";
}

/** 下書きのタブを残す（このウィンドウが持つ欄の分だけ） */
const persistDrafts = () => writeDrafts([...states].map(([k, s]) => [k, s.tabs] as const), owns);

/** 開いているかを覚える欄（チャット欄）の、その画面の設定 */
function openSettingOf(key: string) {
  const at = parsePanelKey(key);
  const setting = at && SURFACES[at.surface].openSetting;
  return setting && typeof at.scope === "number" ? setting(at.scope) : undefined;
}

/** 右サイドバーのタブを保存する先（プロジェクトごと） */
function browserProjectOf(key: string): number | null {
  const at = parsePanelKey(key);
  return at?.surface === "side" && typeof at.scope === "number" ? at.scope : null;
}

/** 欄の初めの状態（開いているかを覚える欄は、覚えた値から） */
function initialState(key: string, tabs: readonly PanelTab[] = []): PanelState {
  const setting = openSettingOf(key);
  const project = browserProjectOf(key);
  const browser = project === null ? null : readBrowserSession(project);
  const state = emptyPanel(browser ? [...browser.tabs, ...tabs] : tabs, setting ? readSetting(setting) : false);
  return browser ? { ...state, layout: browser.layout } : state;
}

// 前回残した下書きのタブを、閉じた欄のタブとして戻す（チャットの別ウィンドウに残っていたものは、作成先のプロジェクトのチャットのパネルへ移して残し直す）
const savedDrafts = readSavedDrafts();
const restoredDrafts = moveDraftsToChatPanels(savedDrafts);
for (const [key, tabs] of restoredDrafts) states.set(key, initialState(key, tabs));
if (restoredDrafts !== savedDrafts) writeDrafts(restoredDrafts);

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

/** 欄の決まり（最後のタブを閉じたら閉じるか） */
function rulesOf(key: string): PanelRules {
  const at = parsePanelKey(key);
  return { closeWhenEmpty: at ? SURFACES[at.surface].closeWhenEmpty : false };
}

/**
 * 閉じたタブの後始末（種類の表の dispose。ターミナルはシェルも止める）。送らずに閉じた新しいチャットのタブは、その右の欄（draft-<key>）も捨てる
 * （送ったときは、先にできたチャットの右の欄へ移してある）
 */
function dispose(tab: PanelTab): void {
  specOf(tab).dispose?.(tab);
  if (tab.kind !== "new") return;
  const side = panelKey("agents", draftScope(tab.key));
  const state = states.get(side);
  if (!state) return;
  states.delete(side);
  state.tabs.forEach(dispose);
}

/**
 * 欄の状態を変える（panelReducer）。閉じたタブの後始末をし、下書きのタブ・開いているか（覚える欄だけ）を保存して、読んでいる部品に知らせる。
 * 変わらなければ何もしない
 */
export function dispatchPanel(key: string, action: PanelAction): void {
  if (replica) return;
  const prev = panelStateOf(key);
  const next = panelReducer(prev, action, rulesOf(key));
  if (next === prev) return;
  states.set(key, next);
  if (next.tabs !== prev.tabs) {
    const kept = new Set(next.tabs.map((t) => t.key));
    // 別ウィンドウへ移したタブは後始末をしない（keep。ターミナルのシェルは移した先がつなぐ）
    if (!(action.type === "close" && action.keep)) prev.tabs.filter((t) => !kept.has(t.key)).forEach(dispose);
    persistDrafts();
  }
  if (owns(key) && (next.tabs !== prev.tabs || next.layout !== prev.layout)) {
    const project = browserProjectOf(key);
    if (project !== null) writeBrowserSession(project, next);
  }
  const setting = next.open !== prev.open ? openSettingOf(key) : undefined;
  if (setting) writeSetting(setting, next.open);
  version++;
  for (const listener of [...listeners]) listener();
}

/**
 * 欄の状態を別の名前へ移す（送る前の新しいチャットの右の欄を、送ってできたチャットの右の欄へ。features/panel/agents/draftSide.ts）。
 * mapTab でタブを書き換える。移す先にもうタブがあれば、移す元のタブは閉じて捨てる（重ねない）
 */
export function movePanel(from: string, to: string, mapTab: (tab: PanelTab) => PanelTab = (tab) => tab): void {
  if (replica) return;
  const prev = states.get(from);
  if (!prev) return;
  states.delete(from);
  if (panelStateOf(to).tabs.length > 0) prev.tabs.forEach(dispose);
  else states.set(to, { ...prev, tabs: prev.tabs.map(mapTab) });
  version++;
  for (const listener of [...listeners]) listener();
}

/** 写しの店にする / やめる（サイドバーの別ウィンドウ。写しの間は dispatchPanel・movePanel は何もしない。閉じたタブの後始末・下書きの保存はメインのウィンドウが行う） */
export function setPanelReplica(on: boolean): void {
  replica = on;
}

/** すべての欄の状態を置き換える（サイドバーの別ウィンドウが、メインのウィンドウから届いた写しを入れる） */
export function replacePanels(entries: readonly (readonly [string, PanelState])[]): void {
  states.clear();
  for (const [key, state] of entries) states.set(key, state);
  version++;
  for (const listener of [...listeners]) listener();
}

/** このウィンドウが持つ欄を決める（チャット欄を別ウィンドウへ移す・戻すとき） */
export function setPanelOwnership(fn: (key: string) => boolean): void {
  owns = fn;
}

/** 合う欄の状態を取り出して、このウィンドウから外す（閉じたタブの後始末はしない。別ウィンドウへ移すとき） */
export function takePanels(match: (key: string) => boolean): [string, PanelState][] {
  const taken = [...states].filter(([key]) => match(key));
  if (taken.length === 0) return taken;
  for (const [key] of taken) states.delete(key);
  version++;
  for (const listener of [...listeners]) listener();
  return taken;
}

/** 合う欄の状態を、届いたものに置き換える（後始末はしない。別ウィンドウから移されたとき・戻されたとき）。下書きも残し直す */
export function putPanels(match: (key: string) => boolean, entries: readonly (readonly [string, PanelState])[]): void {
  for (const key of [...states.keys()]) if (match(key)) states.delete(key);
  for (const [key, state] of entries) states.set(key, state);
  version++;
  persistDrafts();
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
  if (e.type === "project_deleted" && !replica) {
    const side = panelKey("side", e.id);
    if (owns(side)) {
      writeBrowserSession(e.id, null);
      takePanels((key) => key === side);
    }
    return;
  }
  if (e.type !== "chat_deleted") return;
  for (const [key, state] of [...states]) {
    const gone = state.tabs.filter((t) => specOf(t).chatIdOf?.(t) === e.id);
    if (gone.length > 0) dispatchPanel(key, { type: "close", keys: gone.map((t) => t.key), dismiss: false });
  }
});
