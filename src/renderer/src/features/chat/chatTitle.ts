import { UNTITLED_CHAT_TITLE } from "@shared/types";

/** チャットの名前の文字数の上限（サーバーの入力の検証と同じ） */
export const CHAT_TITLE_MAX = 100;

/** チャットの名前（まだ付いていなければ「Untitled Chat」） */
export function chatTitle(title: string | null | undefined): string {
  return title || UNTITLED_CHAT_TITLE;
}

/**
 * 足す先などに名前で出すチャットの呼び名（「」で囲み、長ければ max 文字で省略）。右の欄・別ウィンドウで、文を足す先のチャット
 * （右の欄を持つチャット・別ウィンドウを開いたチャット）を「メイン」と呼ばずに名前で見せる。一覧にまだなければ「チャット」
 */
export function chatTargetName(chat: { title: string | null } | undefined, max = 16): string {
  if (!chat) return "チャット";
  return `「${shortTitle(chat.title, max)}」`;
}

/**
 * 子チャットの中で選んだ文の足す先の呼び名: 足す先が選んだチャットの直接の親なら「親チャット（機能開発）」と関係で呼び、
 * そうでなければ（孫チャットから、いちばん上の親へ・子チャットの外のタブ）chatTargetName の名前だけ
 */
export function parentTargetName(target: { id: number; title: string | null } | undefined, inner: { parent_chat_id: number | null } | undefined, max = 16): string {
  return target && inner?.parent_chat_id === target.id ? `親チャット（${shortTitle(target.title, max)}）` : chatTargetName(target, max);
}

/** 名前を max 文字までにする（長ければ省略の「…」） */
function shortTitle(title: string | null, max: number): string {
  const name = chatTitle(title);
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** 送る前の新しいチャット（下書き）の名前（タブ・サイドバー・ボードに出すので短く。名前として見せるので英語の頭を大文字に） */
export const NEW_CHAT_TITLE = "New Chat";

/** グループに入っていないチャットのまとまりの名前（サイドバー・ボードの列・タブのまとまりの札・作成先のグループの選択肢。NEW_CHAT_TITLE とそろえて英語） */
export const NO_GROUP_LABEL = "No Group";
