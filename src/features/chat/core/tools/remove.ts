// チャットをアーカイブする・消すツール（kickoff_chat の archive_chat・delete_chat。定義。中身は aiChatRemove.ts の ChatRemover）。
// 同じプロジェクトのチャットを子孫ごと。自分・自分の祖先は作業の終わりに行う予約。承認は聞かない（利用者が頼んだときだけ使うよう使い方で伝える）
import { z } from "zod";
import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import { defineAiTool, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import type { ChatRemover } from "./aiChatRemove";

/** チャットをアーカイブする・消すツールの使い方（MCP の instructions として AI に渡す） */
const REMOVE_INSTRUCTIONS = [
  `archive_chat はチャットをアーカイブし、delete_chat はチャットを Kickoff のゴミ箱に入れる（${TRASH_KEEP_DAYS} 日間はプロジェクトの「ゴミ箱」タブから戻せる）。どちらも子チャット・孫チャットも一緒。相手は同じプロジェクトのチャット（家系に依らない。ID は list_project_chats・list_family_chats で確かめる）。`,
  "使うのは、利用者がチャットで頼んだときだけ（「このチャットをアーカイブして」「〇〇のチャットを消して」など）。作業が済んだように見えても、自分の判断でアーカイブ・削除しない。承認は聞かない。「アーカイブ」と「削除」を取り違えない（頼まれた方だけを使う）。",
  "作業中のチャットが含まれていれば断られる（待たない）。このチャット自身（とその祖先）を頼まれたときは、この作業が終わってから Kickoff が行う（予約）ので、予約したら結果を返答で伝えて作業を終える。",
];

/** チャットをアーカイブする・消すツールの組（order 120。中身を渡したときだけ出す） */
export function removeToolGroup(remover: () => ChatRemover | undefined): AiToolGroup {
  return {
    server: "kickoff_chat",
    order: 120,
    instructions: REMOVE_INSTRUCTIONS,
    open: ({ chatId }) => {
      const chats = remover();
      if (!chats) return null;
      const chatIdInput = z.number().int().describe("アーカイブする・消すチャットの ID（必須。このチャット自身でも書く）");
      return [
        defineAiTool({
          server: "kickoff_chat",
          name: "archive_chat",
          description: "同じプロジェクトのチャットを子チャットごとアーカイブする（利用者が頼んだときだけ。このチャット自身なら作業の終わりに行う予約）",
          input: { chat_id: chatIdInput },
          run: async ({ chat_id }) => chats.fromChat(chatId, "archive", chat_id),
        }),
        defineAiTool({
          server: "kickoff_chat",
          name: "delete_chat",
          description: `同じプロジェクトのチャットを子チャットごと Kickoff のゴミ箱に入れる（${TRASH_KEEP_DAYS} 日間は戻せる。利用者が頼んだときだけ。このチャット自身なら作業の終わりに行う予約）`,
          input: { chat_id: chatIdInput },
          run: async ({ chat_id }) => chats.fromChat(chatId, "delete", chat_id),
        }),
      ];
    },
  };
}
