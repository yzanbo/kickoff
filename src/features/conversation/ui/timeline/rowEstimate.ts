import type { ChatEventOf } from "@shared/chat/chatEvent";
import { openKey, type ToolCall } from "@/features/chat/ui";
import { COLLAPSE_PX } from "@/features/conversation/ui/messages/collapse";

/**
 * 測っていない流れの行の高さの見積もり。
 * 開いた直後の箱・覚えた高さのない行の --row-est に使う。外れても位置はブラウザのスクロールアンカーが保つので、
 * 目的は「スクロールバーのつまみの大きさと位置がおおよそ合う」「描く範囲の決め方が大きく外れない」こと。
 * 値は文字の倍率 1 のときの px（倍率を掛ける）。確かめ用のチャットで「見積もり ÷ 測った高さ」の中央値が 0.8〜1.25 に入るように合わせた
 */

/** 見積もりの種類（補正を種類ごとに覚える） */
export type EstimateKind = "user" | "text" | "thinking" | "tools" | "subagent" | "visual" | "turn" | "note" | "compact";

export interface EstimateContext {
  /** 流れの本文の幅（px。.timeline-inner の中身の幅） */
  textWidth: number;
  /** 会話の文字の倍率（--chat-scale） */
  scale: number;
  /** 開いているか（見え方の店の open） */
  isOpen: (key: string) => boolean;
  /** 種類ごとの補正（測った高さ ÷ 見積もりの移動平均。なければ 1） */
  correction: (kind: EstimateKind) => number;
  /** 作業の終わりに変更カードが付くか（作業の終わりの記録の ID） */
  hasTurnChanges: (resultId: number) => boolean;
}

/** 本文の文字の大きさ（.timeline-inner の 15px） */
const FONT_PX = 15;
/** 返答の 1 行（line-height 1.7） */
const REPLY_LINE = FONT_PX * 1.7;
/** 自分の発言の 1 行（line-height はふつうの 1.5 ほど） */
const USER_LINE = FONT_PX * 1.5;
/** 長い自分の発言を畳む高さ（messages/collapse.ts の COLLAPSE_PX）を超えてよい分 */
const COLLAPSE_SLACK_PX = 40;

/** 文字の幅（em。全角は 1・半角は 0.55） */
function charEm(code: number): number {
  return code < 0x2e80 || (code >= 0xff61 && code <= 0xff9f) ? 0.55 : 1;
}

/** 1 段落（改行のない文）を幅 widthPx に折り返したときの行数（空なら 1） */
export function wrappedLines(text: string, widthPx: number, fontPx: number): number {
  if (!text) return 1;
  let em = 0;
  for (let i = 0; i < text.length; i++) em += charEm(text.charCodeAt(i));
  return Math.max(1, Math.ceil((em * fontPx) / Math.max(widthPx, fontPx * 4)));
}

/** 文全体の行数（段落ごとに折り返しを数える） */
export function textLines(text: string, widthPx: number, fontPx: number): number {
  let lines = 0;
  for (const para of text.split("\n")) lines += wrappedLines(para, widthPx, fontPx);
  return lines;
}

/**
 * Markdown の返答の高さ（倍率 1）: ふつうの行は折り返しを数えて 1 行の高さ、見出しは 1 行 ＋ 12、コードブロックの中は 1 行 20 ＋ 帯 36
 * （はみ出しは横スクロールなので折り返さない）、表は 1 行 34、区切り線は 24、空行は段落の間 12、図（mermaid）・数式ブロックは 1 つ 200
 */
export function estimateMarkdown(text: string, widthPx: number): number {
  let h = 0;
  // 開いているコードブロックの記号（なければ null）・図か・中の行数
  let fence: string | null = null;
  let diagram = false;
  let fenceLines = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const open = /^\s*(```+|~~~+)\s*([\w-]*)/.exec(line);
    if (fence !== null) {
      if (open && open[1].startsWith(fence) && !open[2]) {
        h += diagram ? 200 : fenceLines * 20 + 36;
        fence = null;
      } else fenceLines++;
      continue;
    }
    if (open) {
      fence = open[1];
      diagram = open[2] === "mermaid";
      fenceLines = 0;
      continue;
    }
    if (!line.trim()) h += 12;
    else if (/^#{1,6}\s/.test(line)) h += REPLY_LINE + 12;
    else if (/^\s*\|/.test(line)) h += 34;
    else if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) h += 24;
    else if (/^\s*\$\$/.test(line)) h += 100;
    else h += wrappedLines(line.replace(/^\s*([-*+]|\d+\.)\s+/, ""), widthPx - 24, FONT_PX) * REPLY_LINE;
  }
  // 閉じていないコードブロック（書きかけ）も、それまでの行で数える
  if (fence !== null) h += diagram ? 200 : fenceLines * 20 + 36;
  return h;
}

/** 見積もりの幅（倍率 1 のときの本文の幅） */
const widthOf = (ctx: EstimateContext) => ctx.textWidth / ctx.scale;

/** 倍率 1 のときの見積もり（補正の前）。行の種類の表（rowKinds.tsx）が項目ごとに引く */
export const ROW_ESTIMATES = {
  tools(tools: readonly ToolCall[], ctx: EstimateContext): number {
    if (!ctx.isOpen(openKey.toolGroup(tools[0].use.id))) return 30;
    return 30 + tools.length * 28 + tools.filter((t) => ctx.isOpen(openKey.toolCall(t.use.id))).length * 200;
  },
  subagent: (call: ToolCall, ctx: EstimateContext): number => (ctx.isOpen(openKey.subagentCard(call.use.data.id)) ? 64 + 30 + 300 + 120 : 64),
  visual: (): number => 36 + 300,
  subagentEnd: (): number => 28,
  user(e: ChatEventOf<"user">, ctx: EstimateContext): number {
    // 吹き出しの中の幅（流れの 8 割から左右の余白 32 を引く）
    const lines = textLines(e.data.text, widthOf(ctx) * 0.8 - 32, FONT_PX) * USER_LINE;
    const body = !ctx.isOpen(openKey.longMessage(e.id)) && lines > COLLAPSE_PX + COLLAPSE_SLACK_PX ? COLLAPSE_PX + 24 : lines;
    const attached = (e.data.attachments?.length ?? 0) > 0 ? 34 : 0;
    return 24 + 22 + 16 + body + attached;
  },
  /** 質問への回答の吹き出し */
  answer: (): number => 24 + 22 + 16 + 80,
  text: (e: ChatEventOf<"text">, ctx: EstimateContext): number => 16 + estimateMarkdown(e.data.text, widthOf(ctx)),
  thinking: (e: ChatEventOf<"thinking">, ctx: EstimateContext): number =>
    ctx.isOpen(openKey.thinking(e.id)) ? 24 + textLines(e.data.text, widthOf(ctx), FONT_PX) * REPLY_LINE : 24,
  turn: (e: ChatEventOf<"result">, ctx: EstimateContext): number => (ctx.hasTurnChanges(e.id) ? 28 + 34 : 28),
  compact: (): number => 56,
  /** お知らせ・エラー・消去の境目・承認の結果の 1 行（確かめ用のチャットで測って 20 前後） */
  note: (): number => 20,
};

/** 補正の移動平均の重み（新しく測った分） */
const CORRECTION_WEIGHT = 0.1;
/** 1 回で補正に入れる比の範囲（図が後から伸びたなど、極端な行で補正が振れすぎないように） */
const RATIO_MIN = 0.25;
const RATIO_MAX = 4;

/** 測った高さで補正を進める（prev: いまの補正。なければ 1 から） */
export function nextCorrection(prev: number | undefined, measured: number, estimated: number): number {
  if (estimated <= 0 || measured <= 0) return prev ?? 1;
  const ratio = Math.min(RATIO_MAX, Math.max(RATIO_MIN, measured / estimated));
  return (prev ?? 1) * (1 - CORRECTION_WEIGHT) + ratio * CORRECTION_WEIGHT;
}
