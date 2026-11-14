// 子チャットを親から外す（親のないチャットにする・自分の先祖の子に上げる）。メニュー（「親から外す ▸」）とサイドバーのドラッグで共通の確かめと後始末
// （2026-11-14 に利用者と決めた。メモの仕様書「子チャットを親から外す」）。付け替え（ほかのチャットの下へ）はしない
import type { Chat } from "@shared/types";
import { api } from "@/api";
import { openChat } from "@/app/router";
import { knownChat } from "@/stores/chats";
import { alertDialog, confirmDialog } from "@/ui/dialogs";
import { chatTitle } from "@/features/chat/chatTitle";
import { allPanels, dispatchPanel } from "@/features/panel/state/panelStore";
import { isTabVisible } from "@/features/panel/layout/paneTree";
import { ancestorsOf } from "./childChats";

/** 外す先（parentId: null = 親のないチャット（groupId のグループへ。groupName は確かめの文に出す並べる先の名前。グループ名・「No Group」）/ 先祖の ID = その子に上げる） */
export interface DetachTo {
  parentId: number | null;
  groupId?: number | null;
  groupName?: string;
}

/** 上げられる先（自分の先祖のうち、いまの親を除いたもの。根 → 親の親の順。読み込んだ一覧でたどれたところまで） */
export function raiseTargets(chat: Chat): Chat[] {
  return ancestorsOf(chat, knownChat).slice(0, -1);
}

/** 作業中なら外せない理由（その下の孫などが作業中でも、外すのはこのチャットだけなので断らない） */
export const detachBlockReason = (chat: Pick<Chat, "status">): string | null =>
  chat.status === "running" ? "作業中の子チャットは親から外せません。終わってから（または中断してから）行ってください" : null;

/**
 * 確かめてから子チャットを親から外す（作業中なら理由を知らせて外さない）。外したら、親のないチャットにしたときは右の欄のそのタブを閉じ、
 * そのタブを見ていたなら親のないチャットとしてチャットのパネルで開き直す（別ウィンドウはそのまま。先祖の子に上げたときは同じ右の欄なので残す）。
 * 外したら外したあとのチャット、やめた・外せなければ null。失敗は投げる（呼ぶ側が知らせる）
 */
export async function detachChild(chat: Chat, to: DetachTo): Promise<Chat | null> {
  const blocked = detachBlockReason(knownChat(chat.id) ?? chat);
  if (blocked) {
    await alertDialog("親から外せません", blocked);
    return null;
  }
  const parent = chat.parent_chat_id === null ? undefined : knownChat(chat.parent_chat_id);
  const parentName = parent ? `「${chatTitle(parent.title)}」` : "親チャット";
  const raiseTo = to.parentId === null ? undefined : knownChat(to.parentId);
  const where =
    to.parentId === null
      ? `親のないチャットにして、サイドバーの${to.groupName ? `「${to.groupName}」` : "一覧"}に並べます。`
      : `「${chatTitle(raiseTo?.title ?? "")}」の子チャットにします。`;
  const ok = await confirmDialog({
    title: `「${chatTitle(chat.title)}」を${parentName}から外しますか？`,
    message: `${where}\n親の発言の下の札は消え、${parentName}の下へは戻せません。会話はそのまま続けられ、この下の子チャット（孫など）も一緒についていきます。`,
    confirmLabel: to.parentId === null ? "親から外す" : "子にする",
  });
  if (!ok) return null;
  const detached = await api.detachChat(chat.id, { parent_chat_id: to.parentId, ...(to.parentId === null ? { group_id: to.groupId ?? null } : {}) });
  if (detached.parent_chat_id === null) reopenDetached(detached);
  return detached;
}

/** 親のないチャットにしたチャットのタブを、右の欄（どのチャットの右の欄でも）から閉じ、見ていたならチャットのパネルで開き直す */
function reopenDetached(chat: Chat) {
  let shown = false;
  for (const [key, state] of [...allPanels()]) {
    if (!key.startsWith("agents:")) continue;
    const tabs = state.tabs.filter((t) => t.kind === "child" && t.childId === chat.id);
    if (tabs.length === 0) continue;
    if (tabs.some((t) => isTabVisible(state.layout, t.key))) shown = true;
    dispatchPanel(key, { type: "close", keys: tabs.map((t) => t.key), dismiss: false });
  }
  if (shown) openChat(chat.project_id, chat.id);
}
