import { knownChat, knownDescendants } from "@/stores/chats";

/**
 * 作業中のためにできない操作の理由（ドラッグの落とし先に出す。できるなら null）。コアは、チャットか子孫（子・孫…）のどれかが
 * 作業中なら、別のプロジェクトへの移動・アーカイブを 409 で断る（Runner の requireIdle）。グループの移動・固定・名前の変更は作業中でもできる。
 * 作業中かは読み込んだ一覧の status（"running"）で見る（送る準備の途中などはコアが断り、そのときはお知らせで出す）
 */
export function busyBlockReason(chatId: number, action: "移動" | "アーカイブ"): string | null {
  const chat = knownChat(chatId);
  if (!chat) return null;
  if (chat.status === "running") return `作業中のチャットは${action}できません`;
  if (knownDescendants(chatId).some((c) => c.status === "running")) return `作業中の子チャットがあるので${action}できません`;
  return null;
}
