import { createLucideIcon } from "lucide-react";

/**
 * チャットの外から、チャットの入力欄に足す（メモの添付・選んだ部分の引用など）ときのアイコン:
 * 吹き出しの中へ入る下向きの矢印。入力欄の中の「ファイルを添付」（Paperclip）・新しい子チャット（MessageSquarePlus）と形を分ける
 */
export const AddToChat = createLucideIcon("add-to-chat", [
  ["path", { d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z", key: "bubble" }],
  ["path", { d: "M12 6.5v7", key: "stem" }],
  ["path", { d: "m8.5 10.5 3.5 3.5 3.5-3.5", key: "head" }],
]);
