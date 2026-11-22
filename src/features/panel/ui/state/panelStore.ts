import { useEffect, useSyncExternalStore } from "react";
import { onServerEvent } from "@/foundation/ui/api/events";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { draftScope, panelKey, parsePanelKey, type AnySurface, type PanelSurface } from "@/features/panel/ui/surface";
import type { AnyTabKind, TabBase } from "@/features/panel/ui/kind";
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";
import { readBrowserSession, writeBrowserSession } from "@/features/browser/ui/panel/browserSession";
import { moveDraftsToChatPanels, readSavedDrafts, writeDrafts } from "@/features/composer/ui/drafts/draftPersistence";
import { emptyPanel, panelReducer, type PanelAction, type PanelState } from "./panelState";

/**
 * 欄のパネルの状態を、欄・画面ごと（panelKey）に覚えておく店。ボードとエディタなどのタブを切り替えると欄の部品は
 * 作り直されるので、戻ってきたときに元どおりにできるよう、部品ではなくここで持つ（原則アプリを閉じるまで）。
 * 送る前の新しいチャットと、右サイドバーのブラウザのタブ・配置・欄の開閉は localStorage にも残す。
 * 種類と欄の決まりは作るときに受け取る（app/renderer の起動が panelTabs・panelSurfaces の項目を渡して 1 つ作り、installPanelStore で入れる。テストは自分の店を作る）
 */
export interface PanelStore {
  /** 読むだけ（なければ undefined。覚えない。ほかのウィンドウの欄・画面に出ていない欄を見るとき） */
  peek(key: string): PanelState | undefined;
  /** 欄のいまの状態（まだなければ初めの状態を作って覚える） */
  stateOf(key: string): PanelState;
  /** 欄の状態を変える（panelReducer）。閉じたタブの後始末・保存をし、読んでいる部品に知らせる。変わらなければ何もしない */
  dispatch(key: string, action: PanelAction): void;
  subscribe(listener: () => void): () => void;
  /** すべての欄の状態（下書きの一覧に使う） */
  all(): ReadonlyMap<string, PanelState>;
  /** 状態が変わるたびに増える数（下書きの一覧を作り直すかを決める） */
  version(): number;
  /** タブの種類の決まり */
  kindOf(tab: TabBase): AnyTabKind;
  /** 欄の決まり（知らない欄なら undefined） */
  surfaceOf(id: PanelSurface): AnySurface | undefined;
  /**
   * 写しの店にする / やめる（サイドバーの別ウィンドウ。メインのウィンドウのパネルの状態を replace で受け取って読むだけで、自分では変えない。
   * 写しの間は dispatch・move は何もしない。閉じたタブの後始末・下書きの保存はメインのウィンドウが行う。panelMirror.ts）
   */
  setReplica(on: boolean): void;
  isReplica(): boolean;
  /** このウィンドウが持つ欄を決める（下書き・ブラウザの保存で、ほかのウィンドウが持つ欄の分は書き換えない。panelHandOff.ts） */
  setOwnership(owns: (key: string) => boolean): void;
  /** このウィンドウが持つ欄か */
  owns(key: string): boolean;
  /** 合う欄の状態を取り出して、このウィンドウから外す（閉じたタブの後始末はしない。別ウィンドウへ移すとき） */
  take(match: (key: string) => boolean): [string, PanelState][];
  /** 合う欄の状態を、届いたものに置き換える（後始末はしない。別ウィンドウから移されたとき・戻されたとき）。下書きも残し直す */
  put(match: (key: string) => boolean, entries: readonly (readonly [string, PanelState])[]): void;
  /** すべての欄の状態を置き換える（サイドバーの別ウィンドウが、メインのウィンドウから届いた写しを入れる） */
  replace(entries: readonly (readonly [string, PanelState])[]): void;
  /**
   * 欄の状態を別の名前へ移す（送る前の新しいチャットの右の欄を、送ってできたチャットの右の欄へ。chatPanel の agents/draftSide.ts）。
   * mapTab でタブを書き換える。移す先にもうタブがあれば、移す元のタブは閉じて捨てる（重ねない）
   */
  move(from: string, to: string, mapTab?: (tab: PanelTab) => PanelTab): void;
  /** 欄が画面に出ていることを知らせる（返り値で取り消す。下書きを開くとき、出ていなければその画面へ移る） */
  mount(key: string): () => void;
  isMounted(key: string): boolean;
}

/** タブの列のある別ウィンドウの欄か（その別ウィンドウが持つので、メインのウィンドウは下書きの保存で書き換えない） */
function isWindowPanel(key: string): boolean {
  const surface = parsePanelKey(key)?.surface;
  return surface === "win" || surface === "cwin";
}

/** 右サイドバーのタブを保存する先（プロジェクトごと） */
function browserProjectOf(key: string): number | null {
  const at = parsePanelKey(key);
  return at?.surface === "side" && typeof at.scope === "number" ? at.scope : null;
}

export function createPanelStore({ kinds, surfaces }: { kinds: readonly AnyTabKind[]; surfaces: readonly AnySurface[] }): PanelStore {
  const kindById = new Map(kinds.map((k) => [k.id, k]));
  const surfaceById = new Map(surfaces.map((s) => [s.id, s]));
  const states = new Map<string, PanelState>();
  const listeners = new Set<() => void>();
  const mounted = new Map<string, number>();
  let version = 0;
  let replica = false;
  let owns: (key: string) => boolean = (key) => !isWindowPanel(key);

  const surfaceOfKey = (key: string) => {
    const at = parsePanelKey(key);
    return at ? surfaceById.get(at.surface) : undefined;
  };
  const kindOf = (tab: TabBase): AnyTabKind => {
    const kind = kindById.get(tab.kind);
    if (!kind) throw new Error(`タブの種類 ${tab.kind} は登録されていない`);
    return kind;
  };
  const notify = () => {
    version++;
    for (const listener of [...listeners]) listener();
  };

  /** 開いているかを覚える欄（チャット欄）の、その画面の設定 */
  const openSettingOf = (key: string) => {
    const at = parsePanelKey(key);
    const setting = at && surfaceById.get(at.surface)?.openSetting;
    return setting && typeof at.scope === "number" ? setting(at.scope) : undefined;
  };

  /** 欄の初めの状態（開いているかを覚える欄は覚えた値から。右サイドバーは保存したブラウザのタブから） */
  const initialState = (key: string, tabs: readonly PanelTab[] = []): PanelState => {
    const setting = openSettingOf(key);
    const project = browserProjectOf(key);
    const browser = project === null ? null : readBrowserSession(project);
    const state = emptyPanel(surfaceOfKey(key), browser ? [...browser.tabs, ...tabs] : tabs, setting ? readSetting(setting) : false);
    return browser ? { ...state, layout: browser.layout } : state;
  };

  /** 下書きのタブを残す（このウィンドウが持つ欄の分だけ） */
  const persistDrafts = () => writeDrafts([...states].map(([k, s]) => [k, s.tabs] as const), owns);

  const stateOf = (key: string): PanelState => {
    let state = states.get(key);
    if (!state) states.set(key, (state = initialState(key)));
    return state;
  };

  /**
   * 閉じたタブの後始末（種類の dispose。ターミナルはシェルも止める）。送らずに閉じた新しいチャットのタブは、その右の欄（draft-<key>）も捨てる
   * （送ったときは、先にできたチャットの右の欄へ移してある）
   */
  const dispose = (tab: PanelTab): void => {
    kindOf(tab).dispose?.(tab);
    if (tab.kind !== "new") return;
    const side = panelKey("agents", draftScope(tab.key));
    const state = states.get(side);
    if (!state) return;
    states.delete(side);
    state.tabs.forEach(dispose);
  };

  const take = (match: (key: string) => boolean): [string, PanelState][] => {
    const taken = [...states].filter(([key]) => match(key));
    if (taken.length === 0) return taken;
    for (const [key] of taken) states.delete(key);
    notify();
    return taken;
  };

  // 前回残した下書きのタブを、閉じた欄のタブとして戻す（チャットの別ウィンドウに残っていたものは、作成先のプロジェクトのチャットのパネルへ移して残し直す）
  const savedDrafts = readSavedDrafts();
  const restoredDrafts = moveDraftsToChatPanels(savedDrafts);
  for (const [key, tabs] of restoredDrafts) states.set(key, initialState(key, tabs));
  if (restoredDrafts !== savedDrafts) writeDrafts(restoredDrafts);

  return {
    peek: (key) => states.get(key),
    stateOf,
    dispatch(key, action) {
      if (replica) return;
      const prev = stateOf(key);
      const next = panelReducer(prev, action, surfaceOfKey(key));
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
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    all: () => states,
    version: () => version,
    kindOf,
    surfaceOf: (id) => surfaceById.get(id),
    setReplica(on) {
      replica = on;
    },
    isReplica: () => replica,
    setOwnership(fn) {
      owns = fn;
    },
    owns: (key) => owns(key),
    take,
    put(match, entries) {
      for (const key of [...states.keys()]) if (match(key)) states.delete(key);
      for (const [key, state] of entries) states.set(key, state);
      version++;
      persistDrafts();
      for (const listener of [...listeners]) listener();
    },
    replace(entries) {
      states.clear();
      for (const [key, state] of entries) states.set(key, state);
      notify();
    },
    move(from, to, mapTab = (tab) => tab) {
      if (replica) return;
      const prev = states.get(from);
      if (!prev) return;
      states.delete(from);
      if (stateOf(to).tabs.length > 0) prev.tabs.forEach(dispose);
      else states.set(to, { ...prev, tabs: prev.tabs.map(mapTab) });
      notify();
    },
    mount(key) {
      mounted.set(key, (mounted.get(key) ?? 0) + 1);
      return () => {
        const left = (mounted.get(key) ?? 1) - 1;
        if (left > 0) mounted.set(key, left);
        else mounted.delete(key);
      };
    },
    isMounted: (key) => mounted.has(key),
  };
}

/** アプリの店（起動で 1 つ入れる。下の関数はこれを使う） */
let installed: PanelStore | null = null;

/** アプリの店を入れる（app/renderer の起動が 1 回。テストは自分の店を入れて、終わったら戻す）。前の店を返す */
export function installPanelStore(store: PanelStore | null): PanelStore | null {
  const before = installed;
  installed = store;
  return before;
}

function store(): PanelStore {
  if (!installed) throw new Error("パネルの店は installPanelStore の前に使われた");
  return installed;
}

/**
 * サーバーの知らせで欄を片付ける（起動で 1 回。やめるときは返り値を呼ぶ）: 削除したチャットのタブ（そのチャットのサブエージェントのタブも）は、
 * どの欄でも閉じる（画面に出ていない欄も）。削除したプロジェクトの右サイドバーのブラウザは保存からも外す
 */
export function startPanelServerEvents(): () => void {
  return onServerEvent(["project_deleted", "chat_deleted"], (e) => {
    const s = store();
    if (e.type === "project_deleted") {
      if (s.isReplica()) return;
      const side = panelKey("side", e.id);
      if (s.owns(side)) {
        writeBrowserSession(e.id, null);
        s.take((key) => key === side);
      }
      return;
    }
    for (const [key, state] of [...s.all()]) {
      const gone = state.tabs.filter((t) => s.kindOf(t).ownerChatId?.(t) === e.id);
      if (gone.length > 0) s.dispatch(key, { type: "close", keys: gone.map((t) => t.key), dismiss: false });
    }
  });
}

export const panelStateOf = (key: string) => store().stateOf(key);
/** 欄の状態を読むだけ（なければ undefined。ほかのウィンドウの欄を、このウィンドウの店に作らない） */
export const peekPanel = (key: string) => store().peek(key);
export const dispatchPanel = (key: string, action: PanelAction) => store().dispatch(key, action);
export const allPanels = () => store().all();
export const panelsVersion = () => store().version();
export const subscribePanels = (listener: () => void) => store().subscribe(listener);
export const kindOf = (tab: TabBase) => store().kindOf(tab);
export const surfaceOf = (id: PanelSurface) => store().surfaceOf(id);
export const movePanel = (from: string, to: string, mapTab?: (tab: PanelTab) => PanelTab) => store().move(from, to, mapTab);
export const setPanelReplica = (on: boolean) => store().setReplica(on);
export const replacePanels = (entries: readonly (readonly [string, PanelState])[]) => store().replace(entries);
export const setPanelOwnership = (fn: (key: string) => boolean) => store().setOwnership(fn);
export const takePanels = (match: (key: string) => boolean) => store().take(match);
export const putPanels = (match: (key: string) => boolean, entries: readonly (readonly [string, PanelState])[]) => store().put(match, entries);
export const isPanelMounted = (key: string) => store().isMounted(key);

/** 欄の状態を読む（変わったら描き直す） */
export function usePanelState(key: string): PanelState {
  return useSyncExternalStore(subscribePanels, () => panelStateOf(key));
}

/** 欄を開いているか（欄の殻が読む。key がなければ閉じている） */
export function usePanelOpen(key: string | undefined): boolean {
  return useSyncExternalStore(subscribePanels, () => (key === undefined ? false : panelStateOf(key).open));
}

/** 欄が画面に出ている間、出ていることを知らせる */
export function useMountedPanel(key: string) {
  useEffect(() => store().mount(key), [key]);
}
