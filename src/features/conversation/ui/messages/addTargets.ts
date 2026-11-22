// 選んだ文・右クリックの項目を足す先のチャットの決め方（純粋。右クリックの AddToChatItems と選んだときのボタン SelectionAttach が同じものを使う）
import type { ChatRole } from "@/features/chat/ui";

/** 足す先（main = 右の欄・別ウィンドウの足す先のチャット / inner = その中の子チャット・ノートのチャット / this = チャットの画面のこのチャット） */
export interface ChatAddTarget {
  kind: "main" | "inner" | "this";
  chatId: number;
  /** 呼び名（メニューの見出しと、ボタンの「〜に追加」） */
  name: string;
}

/** 中のチャットの種類ごとの呼び名 */
const INNER_NAMES: Partial<Record<ChatRole, string>> = { child: "子チャット", note: "ノートのチャット" };

/**
 * 足す先の一覧。mainChatId（右の欄・別ウィンドウの足す先のチャット）がなければ、チャットの画面のこのチャット 1 つ（chatId がなければなし）。
 * あれば足す先のチャット（名前で呼ぶ）と、選んだ所が別のチャットの画面の中なら、そのチャット（子チャット・ノートのチャット。ほかは「このチャット」）
 */
export function addTargetsOf({ chatId, mainChatId, role, mainName }: { chatId: number | null; mainChatId: number | null; role: ChatRole | null; mainName: string }): ChatAddTarget[] {
  if (mainChatId === null) return chatId === null ? [] : [{ kind: "this", chatId, name: "チャット" }];
  const main: ChatAddTarget = { kind: "main", chatId: mainChatId, name: mainName };
  if (chatId === null || chatId === mainChatId) return [main];
  return [main, { kind: "inner", chatId, name: (role && INNER_NAMES[role]) ?? "このチャット" }];
}
