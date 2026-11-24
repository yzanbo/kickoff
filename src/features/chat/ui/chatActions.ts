import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import type { Chat } from "@shared/chat/types";
import { chatsApi } from "@/features/chat/ui/api/chats";
import { chatTitle } from "./chatTitle";
import { alert, confirm } from "@/foundation/ui/kit/ask";
import { errorMessage } from "@shared/foundation/errors";
import { knownDescendantCount } from "@/features/chat/ui/store/knownChats";
import { open } from "@/foundation/ui/navigation/open";
import { parse } from "@/foundation/ui/navigation/router";
import { showToast } from "@/foundation/ui/kit/toast";
import { showTrashedToast } from "@/features/trash/ui";

/** 子チャットがあれば、アーカイブ・戻す・削除の確かめに添える文（子孫も一緒に扱う） */
function childNote(chat: Pick<Chat, "id">, action: "archive" | "restore" | "delete"): string {
  if (action === "archive") {
    const count = knownDescendantCount(chat.id);
    return count > 0 ? `子チャット ${count} 件（孫も）も一緒にアーカイブします。` : "";
  }
  const count = knownDescendantCount(chat.id, { archived: true });
  if (count === 0) return "";
  return action === "restore"
    ? "一緒にアーカイブした子チャットも戻ります（子チャットだけを先にアーカイブしていたものは、アーカイブしたままです）。"
    : `子チャット ${count} 件（孫も）も一緒に削除します。`;
}

/** アーカイブ・削除の確かめに渡すチャット（1 件を直に渡すか、配列でまとめて渡す） */
type ChatTarget = Pick<Chat, "id" | "title" | "archived_at">;

/**
 * 1 件ずつ送り、断られたもの（作業中など）は最後にまとめて知らせる。1 件を直に渡したときは失敗をそのまま投げる（呼ぶ側が知らせる）
 */
async function eachChat<T extends Pick<Chat, "title">>(target: T | readonly T[], action: string, fn: (chat: T) => Promise<unknown>) {
  if (!Array.isArray(target)) {
    await fn(target as T);
    return;
  }
  const failures: string[] = [];
  for (const chat of target as readonly T[]) {
    try {
      await fn(chat);
    } catch (e) {
      failures.push(`「${chatTitle(chat.title)}」: ${errorMessage(e)}`);
    }
  }
  if (failures.length > 0) await alert(`${failures.length} 件は${action}できませんでした`, failures.slice(0, 5).join("\n"));
}

/** 1 件を直に渡したものも配列にする */
const listOf = <T>(target: T | readonly T[]): readonly T[] => (Array.isArray(target) ? (target as readonly T[]) : [target as T]);

/**
 * 確かめてから、チャットをアーカイブする（どれもアーカイブ済みなら戻す。どちらも確かめる。やめたら false）。1 件なら確かめの文に名前と子チャットの数を出す。
 * アーカイブ・戻すはどこから押しても必ず確かめる（確かめずにアーカイブする操作は置かない）
 */
export async function confirmArchiveChats(target: ChatTarget | readonly ChatTarget[]): Promise<boolean> {
  const chats = listOf(target);
  const restore = chats.every((r) => r.archived_at);
  const targets = restore ? chats : chats.filter((r) => !r.archived_at);
  const one = targets.length === 1 && chats.length === 1 ? targets[0] : null;
  const ok = await confirm(
    one
      ? one.archived_at
        ? { title: `チャット「${chatTitle(one.title)}」をアーカイブから戻しますか？`, message: `一覧に、また出るようになります。${childNote(one, "restore")}`, confirmLabel: "戻す" }
        : {
            title: `チャット「${chatTitle(one.title)}」をアーカイブしますか？`,
            message: `一覧から隠れます。会話の記録は残ります。${childNote(one, "archive")}サイドバーの「チャット」の行の「アーカイブ」を「表示」にすると出せ、右クリックのメニューから戻せます。`,
            confirmLabel: "アーカイブ",
          }
      : restore
        ? {
            title: `${targets.length} 件のチャットをアーカイブから戻しますか？`,
            message: "一覧に、また出るようになります。一緒にアーカイブした子チャットも戻ります（子チャットだけを先にアーカイブしていたものは、アーカイブしたままです）。",
            confirmLabel: "戻す",
          }
        : {
            title: `${targets.length} 件のチャットをアーカイブしますか？`,
            message: "一覧から隠れます。会話の記録は残ります。子チャット（孫も）も一緒にアーカイブします。作業中のチャットはアーカイブできません。",
            confirmLabel: "アーカイブ",
          },
  ).then((r) => r !== null);
  if (ok) await eachChat(Array.isArray(target) ? targets : targets[0], restore ? "戻す" : "アーカイブ", (r) => chatsApi.archiveChat(r.id, !restore));
  return ok;
}

/** チャットをサイドバーのプロジェクトの上に固定する（固定していればやめる） */
export const togglePinChat = (chat: Pick<Chat, "id" | "pinned">) => chatsApi.pinChat(chat.id, !chat.pinned);

/**
 * チャットを削除する = Kickoff のゴミ箱へ（消したチャットの入力欄の書きかけの文・添付は、入力欄が知らせ chat_deleted で消す）。label を渡すと、
 * 入れた直後に「元に戻す」の知らせを出す（まとめて消すときは出さない）
 */
export async function deleteChat(chatId: number, label?: string) {
  const { trash_id } = await chatsApi.deleteChat(chatId);
  if (label !== undefined) showTrashedToast(trash_id, label);
}

/**
 * 確かめてから、チャットを削除する（やめたら false）。1 件なら確かめの文に名前と子チャットの数を出す。
 * 1 件を直に渡したら「元に戻す」の知らせ、配列で渡したら入れた件数を知らせる
 */
export async function confirmDeleteChats(target: Pick<Chat, "id" | "title"> | readonly Pick<Chat, "id" | "title">[]): Promise<boolean> {
  const chats = listOf(target);
  const one = chats.length === 1 ? chats[0] : null;
  const ok = await confirm({
    title: one ? `チャット「${chatTitle(one.title)}」を削除しますか？` : `${chats.length} 件のチャットを削除しますか？`,
    message: one
      ? `Kickoff のゴミ箱に ${TRASH_KEEP_DAYS} 日入り、その間はプロジェクトの「ゴミ箱」から戻せます（${TRASH_KEEP_DAYS} 日たつと会話の記録・添付ごと消えます）。${childNote(one, "delete")}残しておきたいときはアーカイブを使ってください。`
      : `Kickoff のゴミ箱に ${TRASH_KEEP_DAYS} 日入り、その間はプロジェクトの「ゴミ箱」から戻せます（${TRASH_KEEP_DAYS} 日たつと会話の記録・添付ごと消えます）。子チャット（孫も）も一緒に削除します。残しておきたいときはアーカイブを使ってください。作業中のチャットは削除できません。`,
    confirmLabel: "削除",
    danger: true,
  }).then((r) => r !== null);
  if (!ok) return false;
  if (!Array.isArray(target)) {
    const chat = target as Pick<Chat, "id" | "title">;
    await deleteChat(chat.id, chatTitle(chat.title));
    return true;
  }
  await eachChat(chats, "削除", (r) => deleteChat(r.id));
  showToast(`${chats.length} 件のチャットをゴミ箱に入れました（${TRASH_KEEP_DAYS} 日はプロジェクトの「ゴミ箱」から戻せます）`);
  return true;
}

/** まとめて既読にする（未読の印を消す。印のないものはそのまま） */
export const markChatsSeen = (chats: Chat[]) => eachChat(chats.filter((r) => r.unread), "既読に", (r) => chatsApi.markSeen(r.id));

/** まとめてグループへ移す（null はグループなし。同じプロジェクトのチャットだけ） */
export const moveChatsToGroup = (chats: Chat[], groupId: number | null) => eachChat(chats, "移動", (r) => chatsApi.setChatGroup(r.id, groupId));

/**
 * 確かめてから、チャットを別のプロジェクトへ移す（右クリックの「プロジェクトを変更」・サイドバーのプロジェクトへのドラッグで共通。やめたら false）。
 * 作業フォルダが変わり、グループ・作業場所（ワークツリー）は外れる（子チャットも一緒に移る）。group を渡すと、移したあとそのグループへ入れる
 * （ほかのプロジェクトのグループへ落としたとき）。いま開いているチャットなら、移した先のプロジェクトで開き直す（元のボードからは消えるため）
 */
export async function confirmMoveChatToProject(
  chat: Chat,
  project: { id: number; name: string },
  { group }: { group?: { id: number; name: string } } = {},
): Promise<boolean> {
  const lost = [chat.group_id !== null && "グループ", chat.worktree_path && "作業場所（ワークツリー）"].filter(Boolean).join("・");
  const children = knownDescendantCount(chat.id);
  const ok = await confirm({
    title: `チャット「${chatTitle(chat.title)}」を「${project.name}」へ移しますか？`,
    message: [
      "これからの作業は、移した先のプロジェクトフォルダ（本体）で行います。会話はそのまま続けられます。",
      lost && !group ? `いまの${lost}は外れます。` : "",
      lost && group ? `いまの${lost}は外れ、グループ「${group.name}」に入れます。` : "",
      !lost && group ? `グループ「${group.name}」に入れます。` : "",
      children > 0 ? `子チャット ${children} 件（孫も）も一緒に移します。` : "",
    ].join(""),
    confirmLabel: "移動する",
  });
  if (!ok) return false;
  await chatsApi.moveChat(chat.id, project.id);
  if (group) await chatsApi.setChatGroup(chat.id, group.id);
  const route = parse(window.location.hash);
  if (route.name === "chat" && route.chatId === chat.id) open({ kind: "chat", projectId: project.id, chatId: chat.id });
  return true;
}

/** confirmMoveChatToProject の、失敗をお知らせで出す形（ドラッグで落としたときなど、待つ人がいないとき） */
export const moveDroppedChatToProject = (chat: Chat, project: { id: number; name: string }, group?: { id: number; name: string }) =>
  void confirmMoveChatToProject(chat, project, { group }).catch((e: unknown) => alert("チャットを移せませんでした", errorMessage(e)));
