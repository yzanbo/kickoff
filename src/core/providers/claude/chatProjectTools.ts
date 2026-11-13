// kickoff_chat のプロジェクトに足す・変えるツール（add_snippet・move_memo）。中身は core/chat/aiProject.ts、ここは引数の形と使い方だけ
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { SNIPPET_LABEL_MAX, SNIPPET_TEXT_MAX } from "@shared/types";
import type { AiProjectTools } from "../../chat/aiProject.js";
import { run } from "./chatToolResult.js";

/** プロジェクトに足す・変えるツールの使い方（MCP の instructions として AI に渡す） */
export const PROJECT_INSTRUCTIONS = [
  "add_snippet は、このプロジェクトの定型文（チャット欄の上の帯から入力欄に入れる、よく使う文）に足す。足すだけで、直す・消すはできない。すべてのプロジェクトで使うかは利用者が画面で決める。利用者が「定型文にして」「定型文に登録して」と頼んだときに使う。",
  "move_memo は、このプロジェクトのメモ（メモのフォルダの .md・.html とフォルダ）の名前を変える・別のフォルダへ移す。行き先に同じ名前があれば断る（上書きしない）。拡張子は変えられない。メモの名前の変更・移動は Bash の mv ではなく必ずこれを使う（mv だとメモのチャットとのつながりが切れる）。",
];

/** プロジェクトに足す・変えるツール（聞かずに行う） */
export function projectTools(project: AiProjectTools) {
  const memoPath = z.string().min(1);
  return [
    tool(
      "add_snippet",
      "このプロジェクトの定型文に足す（足すだけ）",
      {
        text: z.string().min(1).max(SNIPPET_TEXT_MAX).describe("定型文の本文（入力欄に入る文）"),
        label: z.string().max(SNIPPET_LABEL_MAX).optional().describe("帯のボタンに出す短い名前（省くと本文の 1 行目）"),
      },
      run((args) => project.addSnippet(args)),
    ),
    tool(
      "move_memo",
      "このプロジェクトのメモ（ファイル・フォルダ）の名前を変える・移す（上書きしない）",
      {
        from: memoPath.describe("いまのメモのパス（メモのフォルダからの相対パスか、メモのフォルダの中の絶対パス）"),
        to: memoPath.describe("新しいパス（同じ形。途中のフォルダはなければ作る）"),
      },
      run((args) => project.moveMemo(args)),
    ),
  ];
}
