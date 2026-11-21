// 作業場所の移動が実行に足すもの: AI のツール move_workplace・cancel_workplace_move（kickoff_chat の order 130。中身は aiWorkplace.ts、ここは引数の形と使い方・承認の聞き方）と、
// 移したあと最初の実行に添える移動の知らせ（contributor "workplaceMove"・turnContext の order 20）
import { z } from "zod";
import { AI_MOVE_WORKPLACE_TOOL, AI_WORKPLACE_TARGETS } from "@shared/workplaceMove/aiWorkplace";
import type { Store, TurnContributor } from "@/features/chat/core/index";
import { carryApprovalText, createAiWorkplaceTools, type AiWorkplaceDeps } from "./aiWorkplace";
import { workplaceMoveContext } from "./workplaceMove";
import { defineAiTool, type AiToolGroup } from "@/foundation/core/aiTools/tool";

/** 作業場所を移すツールの使い方（MCP の instructions として AI に渡す） */
const WORKPLACE_INSTRUCTIONS = [
  "move_workplace は、このチャットの作業場所（本体・いまあるワークツリー・新しいワークツリー）を移す予約をする。この作業が最後まで終わったら Kickoff が移し、continuation の続きの指示をすぐ送る（利用者からは移ってそのまま続けているように見える）。止めた・失敗した作業では移さない。",
  "使うのは、利用者がチャットで頼んだときだけ（「ワークツリーに移って作って」「本体に戻って続けて」など）。移せるのは自分のチャットだけ。Bash の cd・git worktree・EnterWorktree で作業場所を変えず、必ずこのツールを使う（Kickoff の記録と実際の場所がずれるため）。",
  "新しいワークツリー（to: new_worktree）は、このチャットの作業場所のいまのコミットから作る。carry: true でコミットしていない変更も持っていく（新しいワークツリーのときだけ。持っていくファイルの一覧を利用者に見せて承認を聞く）。持っていかなければ変更は元の場所に残る。",
  "continuation（続きの指示）は、それだけで分かる文で書く（移す前に予約したコンテキストの消去・圧縮のあとに届くこともあるので、何をどこまでやったか・次に何をするかを書く）。移したことと移した先は Kickoff が添えて知らせる。",
  "予約したら、結果を返答で伝えて作業を終える（作業が終わるまで移らない）。同じ作業でもう一度頼むと、前の予約を置き換える。利用者に「やっぱり移らないで」と言われたら cancel_workplace_move で取り消す。",
];

/**
 * 作業場所を移す予約・取り消しのツールの組（変更を持っていくときだけ利用者に聞く。覚えない）。移せないチャットからは理由の文で断る。
 * 後始末とターミナルは上の機能なので、呼ばれたときに引く
 */
export function workplaceToolGroup(deps: Omit<AiWorkplaceDeps, "worktreeFinisher" | "terminals"> & { worktreeFinisher: () => AiWorkplaceDeps["worktreeFinisher"]; terminals: () => AiWorkplaceDeps["terminals"] }): AiToolGroup {
  return { server: "kickoff_chat", order: 130, instructions: WORKPLACE_INSTRUCTIONS, open: ({ chatId }) => workplaceTools(createAiWorkplaceTools({ ...deps, worktreeFinisher: deps.worktreeFinisher(), terminals: deps.terminals() }, chatId)) };
}

/** 移したあと最初の実行の指示に添える、移動の知らせ（まだ知らせていない区切りがあるときだけ。家系のあと・一度だけ添える知らせの前） */
export function workplaceMoveTurnParts(store: Pick<Store, "events">): TurnContributor {
  return { name: "workplaceMove", order: 20, contribute: ({ chat }) => ({ turnContext: workplaceMoveContext(store.events.pendingWorkplaceMove(chat.id)) }) };
}

function workplaceTools(workplace: ReturnType<typeof createAiWorkplaceTools>) {
  return [
    defineAiTool({
      server: "kickoff_chat",
      name: "move_workplace",
      description: "このチャットの作業場所を移す予約をする（この作業が最後まで終わったら Kickoff が移し、続きの指示を送る。利用者が頼んだときだけ）",
      input: {
        to: z.enum(AI_WORKPLACE_TARGETS).describe("移す先: main = 本体 / worktree = いまあるワークツリー / new_worktree = 新しいワークツリー"),
        worktree: z.string().min(1).optional().describe("to が worktree のとき、移す先のワークツリー（ブランチの名前かフォルダ）"),
        branch: z.string().min(1).max(200).optional().describe("to が new_worktree のとき、新しく作るワークツリーのブランチの名前"),
        carry: z.boolean().optional().describe("コミットしていない変更も持っていく（new_worktree のときだけ。利用者に承認を聞く）"),
        continuation: z.string().min(1).optional().describe("移したあとに送る続きの指示（それだけで分かる文で。省くと移すだけ）"),
      },
      run: (args, turn) =>
        workplace.move(args, async (request) => {
          const decision = await turn.ask({ toolName: AI_MOVE_WORKPLACE_TOOL, input: { ...args, files: request.files }, ...carryApprovalText(request), canRemember: false });
          return decision.action === "allow" || decision.action === "allow_always";
        }),
    }),
    defineAiTool({ server: "kickoff_chat", name: "cancel_workplace_move", description: "このチャットの作業場所を移す予約を取り消す（利用者に「移らないで」と言われたとき）", input: {}, run: () => workplace.cancel() }),
  ];
}
