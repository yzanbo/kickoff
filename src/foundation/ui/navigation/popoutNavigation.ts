// 別ウィンドウの中で画面を移る操作・App のダイアログを開く操作を、メインのウィンドウで行う
// （別ウィンドウには画面もダイアログもないため。サイドバーの別ウィンドウの行・リンク・「新しいチャット」・⌘⇧A・設定など）
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { OPEN_CONTENT_SEARCH_EVENT } from "@/features/chat/ui/chatSearch";
import { OPEN_ACTIVE_CHATS_EVENT } from "@/features/chatList/ui/activeChats/openActiveChats";
import { OPEN_NEW_PROJECT_EVENT, OPEN_NO_PROJECTS_GUIDE_EVENT } from "@/features/projects/ui/new/openNewProject";
import { OPEN_SETTINGS_EVENT } from "@/features/settings/ui/openSettings";
import { parsePopout, popoutPath, type PopoutRoute } from "./popout";
import { navigate, parse } from "./router";
import { postToMainWindow, type WindowMessage } from "./windowBus";

/** 新しいチャットを始める（⌘N と同じ。App が受け取る。サイドバーの別ウィンドウの「新しいチャット」から） */
export const START_NEW_CHAT_EVENT = "kickoff:start-new-chat";
/** コマンドパレット（⌘K）を開く（App が受け取る。サイドバーの別ウィンドウの「検索」から） */
export const OPEN_COMMAND_PALETTE_EVENT = "kickoff:open-command-palette";

/** App が受けるイベントのうち、別ウィンドウで起きたらメインのウィンドウへ渡すもの（中身 detail はウィンドウをまたいで渡せる値だけ） */
const FORWARDED_APP_EVENTS: readonly string[] = [
  OPEN_SETTINGS_EVENT,
  OPEN_ACTIVE_CHATS_EVENT,
  OPEN_NEW_PROJECT_EVENT,
  OPEN_NO_PROJECTS_GUIDE_EVENT,
  OPEN_CONTENT_SEARCH_EVENT,
  START_NEW_CHAT_EVENT,
  OPEN_COMMAND_PALETTE_EVENT,
];

/** App が受けるイベントを起こす（メインのウィンドウなら App が、別ウィンドウなら usePopoutForwarding がメインのウィンドウへ渡す） */
export function dispatchAppEvent(name: typeof START_NEW_CHAT_EVENT | typeof OPEN_COMMAND_PALETTE_EVENT) {
  window.dispatchEvent(new Event(name));
}

/**
 * URL のハッシュが変わったとき、メインのウィンドウで開く画面（別ウィンドウの行き先でなくなったら、その画面。別ウィンドウの行き先のままなら null）。
 * restore は別ウィンドウの URL に戻す先（変わる前の URL が別ウィンドウの行き先ならそれ、なければ開いたときの行き先）
 */
export function forwardedNavigation(hash: string, oldHash: string, route: PopoutRoute): { hash: string; restore: string } | null {
  if (parsePopout(hash)) return null;
  return { hash, restore: parsePopout(oldHash) ? oldHash : `#${popoutPath(route)}` };
}

/** 別ウィンドウ: 画面を移る操作（リンク・navigate・location.hash）と App のイベントを、メインのウィンドウへ渡す（このウィンドウの中身は変えない） */
export function usePopoutForwarding(route: PopoutRoute) {
  useWindowEvent("hashchange", (e) => {
    const next = forwardedNavigation(location.hash, e.oldURL ? new URL(e.oldURL).hash : "", route);
    if (!next) return;
    history.replaceState(null, "", next.restore);
    postToMainWindow({ type: "navigate", hash: next.hash });
  });
  const forward = (e: Event) => postToMainWindow({ type: "appEvent", name: e.type, detail: e instanceof CustomEvent ? (e.detail ?? null) : null });
  useWindowEvent(OPEN_SETTINGS_EVENT, forward);
  useWindowEvent(OPEN_ACTIVE_CHATS_EVENT, forward);
  useWindowEvent(OPEN_NEW_PROJECT_EVENT, forward);
  useWindowEvent(OPEN_NO_PROJECTS_GUIDE_EVENT, forward);
  useWindowEvent(OPEN_CONTENT_SEARCH_EVENT, forward);
  useWindowEvent(START_NEW_CHAT_EVENT, forward);
  useWindowEvent(OPEN_COMMAND_PALETTE_EVENT, forward);
}

/** メインのウィンドウ: 別ウィンドウから渡された画面を開き、イベントを起こし直す（App が受け取る）。受け取った知らせなら true */
export function handleForwarded(m: WindowMessage): boolean {
  if (m.type === "navigate") {
    navigate(parse(m.hash));
    return true;
  }
  if (m.type === "appEvent") {
    if (FORWARDED_APP_EVENTS.includes(m.name)) window.dispatchEvent(new CustomEvent(m.name, { detail: m.detail }));
    return true;
  }
  return false;
}
