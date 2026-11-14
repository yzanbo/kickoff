// kickoff_chat のワークツリーを片付けるツール（finish_worktree）。中身は core/worktrees/finish.ts、ここは引数の形と使い方だけ
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { AiWorktreeTools } from "../../chat/aiWorktree.js";
import { run } from "./chatToolResult.js";

/** ワークツリーを片付けるツールの使い方（MCP の instructions として AI に渡す） */
export const WORKTREE_INSTRUCTIONS = [
  "finish_worktree は、ワークツリーを片付ける（ワークツリーのフォルダ・手元のブランチ・ポートの帯・そのワークツリーだけの Docker の組のコンテナとデータを消す。GitHub で PR がマージ済みならリモートのブランチも）。本体への取り込み（マージ）は含まない（取り込みは別に行う）。",
  "使うのは、利用者がチャットで頼んだときだけ（「後始末して」「このワークツリーを消して」「捨てて」など）。自分の判断で消さない。承認は聞かない。",
  "取り込んでいないコミット・コミットしていない変更があっても消すが、消す前に控えに入れ、3 日間は Kickoff のゴミ箱から戻せる。結果の文（取り込み済みか・控えに入れたもの）はそのまま利用者に伝える。",
  "ワークツリー自身のチャットからは、自分のワークツリーだけを消せる（worktree は省く）。このチャットの作業が終わってから Kickoff が消す（予約）ので、予約したら作業を終える。本体のチャットからは、同じプロジェクトのどのワークツリーでも worktree（ブランチの名前かフォルダ）で指してその場で消す（作業中のチャットがあれば断られる）。ほかのワークツリーのチャットからは消せない。",
  "ワークツリーは Bash の git worktree remove で消さず、必ずこのツールを使う（控え・ポートの帯・チャットの作業場所の付け替えが漏れるため）。",
];

/** ワークツリーを片付けるツール（カードなし） */
export function worktreeTools(worktree: AiWorktreeTools) {
  return [
    tool(
      "finish_worktree",
      "ワークツリーを片付ける（利用者が頼んだときだけ。失うものは控えに入れ、3 日間はゴミ箱から戻せる。自分のワークツリーなら作業の終わりに消す予約）",
      {
        worktree: z.string().min(1).optional().describe("消すワークツリー（ブランチの名前かフォルダ）。ワークツリー自身のチャットからは省く（自分のワークツリー）"),
      },
      run((args) => worktree.finish(args)),
    ),
  ];
}
