// 図が実行に足すもの: AI のツール visual_guide・show_visual・update_visual（kickoff_chat の order 80。中身は aiVisual.ts、ここは引数の形と使い方）と、
// システムプロンプトの「図と数式」の節（contributor "visuals"・節の order 400）
import { defineAiTool, type AiToolDef, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import { z } from "zod";
import { VISUAL_CODE_MAX, VISUAL_GUIDE_TOPICS, VISUAL_KINDS, VISUAL_TITLE_MAX } from "@shared/visuals/aiVisual";
import type { PromptSection, Store, TurnContributor } from "@/features/chat/core/index";
import { createAiVisualTools, type AiVisualTools } from "./aiVisual";

/** 図のツールの使い方（MCP の instructions として AI に渡す） */
const VISUAL_INSTRUCTIONS = [
  "show_visual は、返答の中（呼んだ位置。文の間）に図を描く: 構造の図は kind: mermaid、形を決める図・絵は svg、グラフ・画面のラフ・動く部品（スクリプトと決めた CDN のライブラリを使える）は html。利用者がアスキー・ほかの書き方を頼んだときは、そちらに従う。",
  "このチャットで初めて描く前に visual_guide で書き方（テーマの色の変数・高さ・使える CDN）を読む。図の前後の文で、何の図かを短く説明する。",
  "update_visual は、前に描いた図を元の位置で描き直す（show_visual が返した visual_id と、新しい中身の全体）。直してと頼まれた図は、新しく描かずに描き直す。",
  "どれも返答に図を出すだけで何も変えないので、聞かずに使う。",
];

/** 図と数式: 書き方の細かい決まりは、描く前に visual_guide で読ませる（いつもの指示を長くしない） */
export const VISUAL_SECTION: PromptSection = {
  order: 400,
  heading: `## 図と数式`,
  lines: [
    `- 利用者の画面は返答の Markdown を描きます。図（流れ・構成・関係・グラフ・画面のラフ・動く部品）は、kickoff_chat の show_visual で返答の中に描いてください（構造の図は Mermaid、ほかは SVG か HTML）。このチャットで初めて描く前に visual_guide を読んでください。利用者がアスキーなど別の書き方を頼んだら、そちらに従ってください。`,
    `- 数式は返答の文の中に、段落なら $$ … $$、文の中なら \\( … \\) で書いてください（KaTeX で描きます）。`,
  ],
};

/** システムプロンプトに「図と数式」の節を足す（どのチャットにも） */
export function visualTurnParts(): TurnContributor {
  return { name: "visuals", order: 40, contribute: () => ({ promptSections: [VISUAL_SECTION] }) };
}

/** 返答の中に図（SVG・HTML・Mermaid）を描くツールの組（画面とスマホが記録から描く。どのチャットにも出す） */
export function visualToolGroup(store: Store): AiToolGroup {
  return { server: "kickoff_chat", order: 80, instructions: VISUAL_INSTRUCTIONS, open: ({ chatId }) => visualTools(createAiVisualTools(store, chatId)) };
}

/** 図のツール（聞かずに使う） */
function visualTools(visual: AiVisualTools): AiToolDef[] {
  const title = z.string().max(VISUAL_TITLE_MAX).optional().describe("図の題名（枠の上に出す。短く）");
  const code = z.string().min(1).max(VISUAL_CODE_MAX).describe("図の中身の全体（SVG は <svg …>、HTML は <style>・<script> を含むページか断片、Mermaid は図の文）");
  return [
    defineAiTool({
      server: "kickoff_chat",
      name: "visual_guide",
      description: "図の書き方の説明（テーマの色の変数・高さ・使える CDN・種類ごとの書き方）を読む。このチャットで初めて図を描く前に読む",
      input: { topics: z.array(z.enum(VISUAL_GUIDE_TOPICS)).optional().describe("読む種類（diagram = 構造の図 / chart = グラフ / mockup = 画面のラフ / interactive = 動く部品 / math = 数式）。省くと全部") },
      run: (args) => visual.guide(args.topics ?? []),
    }),
    defineAiTool({
      server: "kickoff_chat",
      name: "show_visual",
      description: "返答の中（呼んだ位置）に図を描く（SVG・HTML・Mermaid）。返った visual_id で描き直せる",
      input: { kind: z.enum(VISUAL_KINDS).describe("svg / html / mermaid"), code, title },
      run: (args) => visual.show(args),
    }),
    defineAiTool({
      server: "kickoff_chat",
      name: "update_visual",
      description: "このチャットで前に描いた図を、元の位置で描き直す（中身の全体を渡す）",
      input: { visual_id: z.string().describe("show_visual が返した visual_id"), code, title },
      run: (args) => visual.update(args),
    }),
  ];
}
