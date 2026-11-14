// kickoff_chat の利用者が見ているものを読むツール（get_user_view）。中身は core/chat/aiUserView.ts、ここは引数の形と使い方だけ
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { AiUserViewTools } from "../../chat/aiUserView.js";
import { run } from "./chatToolResult.js";

/** 利用者が見ているものを読むツールの使い方（MCP の instructions として AI に渡す） */
export const USER_VIEW_INSTRUCTIONS = [
  "get_user_view は、利用者がこの Mac の Kickoff の画面でいま見ているもの（このチャットを開いているウィンドウの、見えているペインごとの前のタブ: チャット・エディタのファイルとカーソル・選んでいる範囲・メモと選んでいる文・ブラウザの URL・GitHub の issue / PR の番号・DB の接続とテーブルなど。右の欄に開いているもの）と、このチャットの最後の発言を送ったときの同じ様子を返す。",
  "利用者が「このファイルのここ」「いま開いてる PR」「選んだところ」のように画面の物を指したときに、自分で確かめるために使う。読むだけなので聞かずに使う。ほかのプロジェクトを見ているときは中身は返らない。分からなければ利用者に聞く。",
];

/** 利用者が見ているものを読むツール（聞かずに返す） */
export function userViewTools(userView: AiUserViewTools) {
  return [tool("get_user_view", "利用者がいま Kickoff の画面で見ているもの（ペインごとの前のタブ・選んでいる範囲など）と、最後の発言を送ったときの様子を読む", {}, run(() => userView.read()))];
}
