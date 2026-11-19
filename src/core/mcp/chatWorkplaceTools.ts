// kickoff_chat の作業場所を移すツール（move_workplace・cancel_workplace_move）。中身は core/chat/aiWorkplace.ts、ここは引数の形と使い方・承認の聞き方だけ
import { z } from "zod";
import { AI_MOVE_WORKPLACE_TOOL, AI_WORKPLACE_TARGETS } from "@shared/chat/aiWorkplace";
import { carryApprovalText, type AiWorkplaceTools } from "../chat/aiWorkplace.js";
import type { ProviderCallbacks } from "../providers/types.js";
import { run } from "./chatToolResult.js";
import { defineTool as tool } from "./tool.js";

/** 作業場所を移すツールの使い方（MCP の instructions として AI に渡す） */
export const WORKPLACE_INSTRUCTIONS = [
  "move_workplace は、このチャットの作業場所（本体・いまあるワークツリー・新しいワークツリー）を移す予約をする。この作業が最後まで終わったら Kickoff が移し、continuation の続きの指示をすぐ送る（利用者からは移ってそのまま続けているように見える）。止めた・失敗した作業では移さない。",
  "使うのは、利用者がチャットで頼んだときだけ（「ワークツリーに移って作って」「本体に戻って続けて」など）。移せるのは自分のチャットだけ。Bash の cd・git worktree・EnterWorktree で作業場所を変えず、必ずこのツールを使う（Kickoff の記録と実際の場所がずれるため）。",
  "新しいワークツリー（to: new_worktree）は、このチャットの作業場所のいまのコミットから作る。carry: true でコミットしていない変更も持っていく（新しいワークツリーのときだけ。持っていくファイルの一覧を利用者に見せて承認を聞く）。持っていかなければ変更は元の場所に残る。",
  "continuation（続きの指示）は、それだけで分かる文で書く（移す前に予約したコンテキストの消去・圧縮のあとに届くこともあるので、何をどこまでやったか・次に何をするかを書く）。移したことと移した先は Kickoff が添えて知らせる。",
  "予約したら、結果を返答で伝えて作業を終える（作業が終わるまで移らない）。同じ作業でもう一度頼むと、前の予約を置き換える。利用者に「やっぱり移らないで」と言われたら cancel_workplace_move で取り消す。",
];

/** 作業場所を移す予約・取り消しのツール（変更を持っていくときだけ requestApproval で聞く。覚えない） */
export function workplaceTools(workplace: AiWorkplaceTools, cb: Pick<ProviderCallbacks, "requestApproval">, signal: AbortSignal) {
  return [
    tool(
      "move_workplace",
      "このチャットの作業場所を移す予約をする（この作業が最後まで終わったら Kickoff が移し、続きの指示を送る。利用者が頼んだときだけ）",
      {
        to: z.enum(AI_WORKPLACE_TARGETS).describe("移す先: main = 本体 / worktree = いまあるワークツリー / new_worktree = 新しいワークツリー"),
        worktree: z.string().min(1).optional().describe("to が worktree のとき、移す先のワークツリー（ブランチの名前かフォルダ）"),
        branch: z.string().min(1).max(200).optional().describe("to が new_worktree のとき、新しく作るワークツリーのブランチの名前"),
        carry: z.boolean().optional().describe("コミットしていない変更も持っていく（new_worktree のときだけ。利用者に承認を聞く）"),
        continuation: z.string().min(1).optional().describe("移したあとに送る続きの指示（それだけで分かる文で。省くと移すだけ）"),
      },
      run((args) =>
        workplace.move(args, async (request) => {
          const decision = await cb.requestApproval(
            { kind: "permission", toolName: AI_MOVE_WORKPLACE_TOOL, input: { ...args, files: request.files }, ...carryApprovalText(request), canRemember: false },
            signal,
          );
          return decision.action === "allow" || decision.action === "allow_always";
        }),
      ),
    ),
    tool("cancel_workplace_move", "このチャットの作業場所を移す予約を取り消す（利用者に「移らないで」と言われたとき）", {}, run(() => workplace.cancel())),
  ];
}
