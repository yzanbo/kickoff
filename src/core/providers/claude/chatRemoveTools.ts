// kickoff_chat のチャットをアーカイブする・消すツール（archive_chat・delete_chat）。中身は core/chat/aiChatRemove.ts、ここは引数の形と使い方だけ
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { AiChatRemoveTools } from "../../chat/aiChatRemove.js";
import { run } from "./chatToolResult.js";

/** チャットをアーカイブする・消すツールの使い方（MCP の instructions として AI に渡す） */
export const REMOVE_INSTRUCTIONS = [
  "archive_chat はチャットをアーカイブし、delete_chat はチャットを Kickoff のゴミ箱に入れる（3 日間はプロジェクトの「ゴミ箱」タブから戻せる）。どちらも子チャット・孫チャットも一緒。相手は同じプロジェクトのチャット（家系に依らない。ID は list_project_chats・list_family_chats で確かめる）。",
  "使うのは、利用者がチャットで頼んだときだけ（「このチャットをアーカイブして」「〇〇のチャットを消して」など）。作業が済んだように見えても、自分の判断でアーカイブ・削除しない。承認は聞かない。「アーカイブ」と「削除」を取り違えない（頼まれた方だけを使う）。",
  "作業中のチャットが含まれていれば断られる（待たない）。このチャット自身（とその祖先）を頼まれたときは、この作業が終わってから Kickoff が行う（予約）ので、予約したら結果を返答で伝えて作業を終える。",
];

/** チャットをアーカイブする・消すツール（カードなし） */
export function removeTools(remove: AiChatRemoveTools) {
  const chatId = z.number().int().describe("アーカイブする・消すチャットの ID（必須。このチャット自身でも書く）");
  return [
    tool(
      "archive_chat",
      "同じプロジェクトのチャットを子チャットごとアーカイブする（利用者が頼んだときだけ。このチャット自身なら作業の終わりに行う予約）",
      { chat_id: chatId },
      run(async (args) => remove.archive(args)),
    ),
    tool(
      "delete_chat",
      "同じプロジェクトのチャットを子チャットごと Kickoff のゴミ箱に入れる（3 日間は戻せる。利用者が頼んだときだけ。このチャット自身なら作業の終わりに行う予約）",
      { chat_id: chatId },
      run(async (args) => remove.remove(args)),
    ),
  ];
}
