import { createLucideIcon } from "lucide-react";

/*
 * 同じ意味には、どこでも同じ lucide のアイコンを使う（置く前に同じ意味のものを探す）:
 * 新しいチャット SquarePen・子チャットを作る MessageSquarePlus・チャット MessageSquare・子チャット MessagesSquare /
 * 送る SendHorizontal・親チャットに渡す Inbox・添付 Paperclip・チャットに足す AddToChat（下）/
 * 固定 Pin・「…」 Ellipsis・取り直す RefreshCw・やり直す RotateCcw・作業場所 GitBranch・変更 FileDiff /
 * 外で開く ExternalLink・ソース CodeXml・設定 Settings・タグ Tag・外す X（消すは Trash2）・欄の開閉は向きのあるもの
 */

/**
 * チャットの外から、チャットの入力欄に足す（ノートの添付・選んだ部分の引用など）ときのアイコン:
 * 吹き出しの中へ入る下向きの矢印。入力欄の中の「ファイルを添付」（Paperclip）・新しい子チャット（MessageSquarePlus）と形を分ける
 */
export const AddToChat = createLucideIcon("add-to-chat", [
  ["path", { d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z", key: "bubble" }],
  ["path", { d: "M12 6.5v7", key: "stem" }],
  ["path", { d: "m8.5 10.5 3.5 3.5 3.5-3.5", key: "head" }],
]);
