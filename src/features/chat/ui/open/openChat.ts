// チャットを開く（子チャットは設定の開き方（右の欄 / 別ウィンドウ）、親のないチャットはチャットのパネル）。右の欄は、いちばん上の親のチャットの画面の右の欄（孫・ひ孫も同じ欄に並べる）。
// 新しい子チャットで聞く（openAskChild）もここ。子チャットから親へは childChats の askChild.ts
import type { Attachment, Chat } from "@shared/chat/types";
import { canPopout, openPopout, parsePopout } from "@/foundation/ui/navigation/popout";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { postToMainWindow } from "@/foundation/ui/navigation/windowBus";
import { CHILD_CHAT_OPEN_IN, CHILD_CHAT_OPEN_ON_CREATE } from "@/foundation/ui/storage/storageKeys";
import { readSetting } from "@/foundation/ui/storage";
import { addChat, knownChat } from "@/features/chat/ui/store/knownChats";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { isScreenShown } from "@/features/chat/ui/screen/chatScreens";
import { panelActions } from "@/features/panel/ui/state/panelActions";
import { panelKey } from "@/features/panel/ui/surfaces";
import { rootChatOf } from "@/features/chat/ui/state/descendants";

/** 子チャットで聞くときに渡すもの（どのチャットの、どの記録から、どの文を。openAskChild） */
export interface AskChildTarget {
  parentId: number;
  eventId: number | null;
  quote: string;
  /** 入力欄に初めに入れる文と添付（「AI に渡す」の「子チャットで聞く」） */
  text?: string;
  attachments?: Attachment[];
}

/** 別ウィンドウの中か（右の欄はメインのウィンドウにだけあるので、メインに知らせて開く） */
const inPopout = () => parsePopout(location.hash) !== undefined;

/** そのチャットのいちばん上の親を、メインのウィンドウで見せる（見えていなければチャットのパネルで開く）。親が分からなければ undefined */
function showRoot(chatId: number): Chat | undefined {
  const chat = knownChat(chatId);
  if (!chat) return undefined;
  const root = rootChatOf(chat, knownChat);
  if (root.parent_chat_id !== null) return undefined;
  if (!isScreenShown(root.id)) openTarget({ kind: "chat", projectId: root.project_id, chatId: root.id });
  return root;
}

/**
 * いちばん上の親のチャットの画面の右の欄で開く（open に、いちばん上の親の ID と右の欄の操作を渡す）。
 * 親が分からない・右の欄を置けないときは false（呼んだ側が別の開き方にする）
 */
export function openInRootSide(chatId: number, open: (rootId: number, side: ReturnType<typeof panelActions>) => void): boolean {
  const root = showRoot(chatId);
  if (!root) return false;
  open(root.id, panelActions(panelKey("agents", root.id)));
  return true;
}

/** 開く場所（auto = 子チャットは設定の開き方・親のないチャットはチャットのパネル / tab = チャットのパネル / side = いちばん上の親の右の欄 / window = 別ウィンドウ） */
export type ChatOpenPlace = "auto" | "tab" | "side" | "window";

/**
 * 開く場所の決め方（設定 → 置ける場所。サブエージェントと子チャットが同じ関数を使う）: 別ウィンドウは開けるときだけ、
 * 右の欄は置けるときだけ、どちらもだめなら流れの中（子チャットは流れの中に置かないので、右の欄を置ける前提で呼ぶ）
 */
export function resolveOpenPlace(setting: "inline" | "side" | "window", caps: { canSide: boolean; canWindow: boolean }): "inline" | "side" | "window" {
  if (setting === "window" && caps.canWindow) return "window";
  if (setting !== "inline" && caps.canSide) return "side";
  return "inline";
}

/** 子チャットを右の欄で開く（いちばん上の親の右の欄のタブ。親が分からなければ、ふつうのチャットと同じくチャットのパネルで） */
function openChildSide(chat: Pick<Chat, "id" | "project_id" | "title">) {
  const opened = openInRootSide(chat.id, (rootId, side) => side.openChild({ chatId: rootId, childId: chat.id, projectId: chat.project_id, title: chat.title }));
  if (!opened) openTarget({ kind: "chat", projectId: chat.project_id, chatId: chat.id });
}

/**
 * チャットを開く。子チャット（と side・window を選んだとき）は、設定の開き方（CHILD_CHAT_OPEN_IN）か選んだ場所で: 右の欄 = いちばん上の親の右の欄のタブ /
 * 別ウィンドウ（もう開いていれば前に出す。開けない（スマホのブラウザ）なら右の欄）。別ウィンドウの中から右の欄に開くときは、メインのウィンドウに頼む。
 * 親のないチャット（と tab）はチャットのパネルで
 */
export function openChat(chat: Pick<Chat, "id" | "project_id" | "title"> & Partial<Pick<Chat, "parent_chat_id">>, place: ChatOpenPlace = "auto") {
  if (place === "tab" || (place === "auto" && (chat.parent_chat_id ?? null) === null)) {
    openTarget({ kind: "chat", projectId: chat.project_id, chatId: chat.id });
    return;
  }
  const where = resolveOpenPlace(place === "auto" ? readSetting(CHILD_CHAT_OPEN_IN) : place, { canSide: true, canWindow: canPopout() });
  if (where === "window") openPopout({ kind: "chat", chatId: chat.id }, `${chatTitle(chat.title)} — 子チャット`);
  else if (inPopout()) postToMainWindow("openChild", { chatId: chat.id });
  else openChildSide(chat);
}

/** 行き先 chat の place（子チャットを設定の開き方・選んだ場所で開く。親のないチャット・知らないチャットはチャットのパネル） */
export function openChatAt(chatId: number, place: ChatOpenPlace): boolean {
  const chat = knownChat(chatId);
  if (!chat || place === "tab" || (place === "auto" && chat.parent_chat_id === null)) return false;
  openChat(chat, place);
  return true;
}

/**
 * 作ったばかりの子チャットを開く場所（設定の「子チャットを作ったとき」CHILD_CHAT_OPEN_ON_CREATE。開かないなら null）。
 * always（「引き継いで開く」で聞かずに作ったとき）なら、開かない設定でも「子チャットを開く場所」（開くために作ったので）。
 * 別ウィンドウを開けない（スマホのブラウザ）なら右の欄
 */
export function createdChildPlace({ always = false }: { always?: boolean } = {}): "side" | "window" | null {
  const on = readSetting(CHILD_CHAT_OPEN_ON_CREATE);
  const place = on !== "none" ? on : always ? readSetting(CHILD_CHAT_OPEN_IN) : null;
  return place === "window" && !canPopout() ? "side" : place;
}

/**
 * 作ったばかりの子チャットを、設定の「子チャットを作ったとき」で開く（右の欄 / 別ウィンドウ / 開かない。createdChildPlace）。
 * 作った知らせより先に一覧へ入れる（入っていないと親をたどれず、右の欄でなくふつうのチャットのタブで開いてしまう。入力欄の上の札にもすぐ並ぶ）
 */
export function openCreatedChild(child: Chat, opts: { always?: boolean } = {}) {
  addChat(child);
  const place = createdChildPlace(opts);
  if (place) openChat(child, place);
}

/**
 * 「新しい子チャットで聞く」「子チャットを作成」: いちばん上の親の右の欄に、新しい子チャットのタブを開く（選んだ文は引用として入力欄に入れ、聞いた位置は送るときに渡す）。
 * 送る前は設定によらず右の欄で書き、作ったあとは設定の「子チャットを作ったとき」に従う（タブの follow）。別ウィンドウからはメインのウィンドウに頼む
 */
export function openAskChild({ parentId, eventId, quote, text, attachments }: AskChildTarget) {
  if (inPopout()) return postToMainWindow("askChild", { parentId, eventId, quote, text, attachments });
  const parent = knownChat(parentId);
  if (!parent) return;
  openInRootSide(parentId, (rootId, side) =>
    side.openNewChild({
      chatId: rootId,
      projectId: parent.project_id,
      ...(parentId !== rootId ? { parentId } : {}),
      ...(quote.trim() ? { quote } : {}),
      ...(eventId !== null ? { eventId } : {}),
      ...(text ? { text } : {}),
      ...(attachments?.length ? { attachments } : {}),
      follow: true,
    }),
  );
}
