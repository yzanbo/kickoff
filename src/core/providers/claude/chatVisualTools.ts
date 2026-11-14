// kickoff_chat の図のツール（visual_guide・show_visual・update_visual）。中身は core/chat/aiVisual.ts、ここは引数の形と使い方だけ
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { VISUAL_CODE_MAX, VISUAL_GUIDE_TOPICS, VISUAL_KINDS, VISUAL_TITLE_MAX } from "@shared/chat/aiVisual";
import type { AiVisualTools } from "../../chat/aiVisual.js";
import { run } from "./chatToolResult.js";

/** 図のツールの使い方（MCP の instructions として AI に渡す） */
export const VISUAL_INSTRUCTIONS = [
  "show_visual は、返答の中（呼んだ位置。文の間）に図を描く: 構造の図は kind: mermaid、形を決める図・絵は svg、グラフ・画面のラフ・動く部品（スクリプトと決めた CDN のライブラリを使える）は html。利用者がアスキー・ほかの書き方を頼んだときは、そちらに従う。",
  "このチャットで初めて描く前に visual_guide で書き方（テーマの色の変数・高さ・使える CDN）を読む。図の前後の文で、何の図かを短く説明する。",
  "update_visual は、前に描いた図を元の位置で描き直す（show_visual が返した visual_id と、新しい中身の全体）。直してと頼まれた図は、新しく描かずに描き直す。",
  "どれも返答に図を出すだけで何も変えないので、聞かずに使う。",
];

/** 図のツール（聞かずに使う） */
export function visualTools(visual: AiVisualTools) {
  const title = z.string().max(VISUAL_TITLE_MAX).optional().describe("図の題名（枠の上に出す。短く）");
  const code = z.string().min(1).max(VISUAL_CODE_MAX).describe("図の中身の全体（SVG は <svg …>、HTML は <style>・<script> を含むページか断片、Mermaid は図の文）");
  return [
    tool(
      "visual_guide",
      "図の書き方の説明（テーマの色の変数・高さ・使える CDN・種類ごとの書き方）を読む。このチャットで初めて図を描く前に読む",
      { topics: z.array(z.enum(VISUAL_GUIDE_TOPICS)).optional().describe("読む種類（diagram = 構造の図 / chart = グラフ / mockup = 画面のラフ / interactive = 動く部品 / math = 数式）。省くと全部") },
      run((args) => visual.guide(args.topics ?? [])),
    ),
    tool(
      "show_visual",
      "返答の中（呼んだ位置）に図を描く（SVG・HTML・Mermaid）。返った visual_id で描き直せる",
      { kind: z.enum(VISUAL_KINDS).describe("svg / html / mermaid"), code, title },
      run((args) => visual.show(args)),
    ),
    tool(
      "update_visual",
      "このチャットで前に描いた図を、元の位置で描き直す（中身の全体を渡す）",
      { visual_id: z.string().describe("show_visual が返した visual_id"), code, title },
      run((args) => visual.update(args)),
    ),
  ];
}
