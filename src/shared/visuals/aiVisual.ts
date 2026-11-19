// チャットの AI が返答の中に描く図（kickoff_chat の visual_guide・show_visual・update_visual）の、コア・画面・スマホで共有する名前・形・決まり。
// 図は記録のツールの呼び出し（入力に中身）と結果（図の ID）から組み立てるので、DB に別の表は持たない
import type { ChatEvent } from "@shared/types";

/** 図の書き方の説明を読むツールの名前 */
export const AI_VISUAL_GUIDE_TOOL = "mcp__kickoff_chat__visual_guide";
/** 図を描くツールの名前 */
export const AI_SHOW_VISUAL_TOOL = "mcp__kickoff_chat__show_visual";
/** 描いた図を描き直すツールの名前 */
export const AI_UPDATE_VISUAL_TOOL = "mcp__kickoff_chat__update_visual";

/** 図の種類（SVG・HTML（スクリプトと決めた CDN のライブラリを使える）・Mermaid） */
export const VISUAL_KINDS = ["svg", "html", "mermaid"] as const;
export type VisualKind = (typeof VISUAL_KINDS)[number];
export const VISUAL_KIND_LABELS: Record<VisualKind, string> = { svg: "SVG", html: "HTML", mermaid: "Mermaid" };

/** 書き方の説明の種類（visual_guide の topic） */
export const VISUAL_GUIDE_TOPICS = ["diagram", "chart", "mockup", "interactive", "math"] as const;
export type VisualGuideTopic = (typeof VISUAL_GUIDE_TOPICS)[number];

/** 図の中身（code）の長さの上限（文字） */
export const VISUAL_CODE_MAX = 200_000;
/** 図の題名の長さの上限 */
export const VISUAL_TITLE_MAX = 100;

/** HTML の図がライブラリを読んでよい所（ほかへの通信は CSP で止める） */
export const VISUAL_CDN_ORIGINS = ["https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://esm.sh"] as const;

/**
 * 図の中で使えるテーマの色などの変数（画面がいまのテーマの値を入れ、テーマを変えたらその場で変える）。
 * 地 bg・一段明るい地 surface・文字 text・薄い文字 muted・線 border・強調 accent とその上の文字 accent-text・危険 danger・グラフの色 chart-1〜6・文字の種類 font / mono・角 radius
 */
export const VISUAL_THEME_VARS = [
  "--vis-bg",
  "--vis-surface",
  "--vis-text",
  "--vis-muted",
  "--vis-border",
  "--vis-accent",
  "--vis-accent-text",
  "--vis-danger",
  "--vis-chart-1",
  "--vis-chart-2",
  "--vis-chart-3",
  "--vis-chart-4",
  "--vis-chart-5",
  "--vis-chart-6",
  "--vis-font",
  "--vis-mono",
  "--vis-radius",
] as const;

/** show_visual の引数 */
export interface ShowVisualInput {
  kind: VisualKind;
  code: string;
  title?: string;
}

/** update_visual の引数（visual_id は show_visual が返した ID。title を省くと前の題名のまま） */
export interface UpdateVisualInput {
  visual_id: string;
  code: string;
  title?: string;
}

/** 図の ID の形（「v-」と英小文字・数字 8 文字） */
const VISUAL_ID = /^v-[a-z0-9]{8}$/;
export const isVisualId = (id: string) => VISUAL_ID.test(id);

/** ツールの結果の文に入れる図の ID の印（画面とコアがここから ID を読む） */
export const visualIdLine = (id: string) => `visual_id: ${id}`;

/** ツールの結果の文から図の ID を読む（なければ null） */
export function visualIdOf(result: string): string | null {
  return /visual_id: (v-[a-z0-9]{8})/.exec(result)?.[1] ?? null;
}

/** 描いた図（記録から組み立てた、いちばん新しい中身） */
export interface ChatVisual {
  id: string;
  kind: VisualKind;
  code: string;
  title: string | null;
  /** 描いたツールの呼び出しの ID（流れの中で図を出す位置） */
  shownBy: string;
  /** 描き直したツールの呼び出しの ID（古い順。描き直していなければ空） */
  updatedBy: string[];
}

const isKind = (v: unknown): v is VisualKind => typeof v === "string" && (VISUAL_KINDS as readonly string[]).includes(v);
const textOf = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * 記録から描いた図を組み立てる（図の ID → 中身）。show_visual は結果の図の ID で覚え、update_visual は成功したものだけを
 * 前に描いた図に重ねる（同じ ID の図の中身・題名をいちばん新しいものにする）。サブエージェントの呼び出しも数える
 */
export function collectVisuals(events: readonly ChatEvent[]): Map<string, ChatVisual> {
  const uses = new Map<string, { name: string; input: Record<string, unknown> }>();
  const visuals = new Map<string, ChatVisual>();
  for (const e of events) {
    if (e.type === "tool_use" && (e.data.name === AI_SHOW_VISUAL_TOOL || e.data.name === AI_UPDATE_VISUAL_TOOL)) {
      const input = e.data.input && typeof e.data.input === "object" ? (e.data.input as Record<string, unknown>) : {};
      uses.set(e.data.id, { name: e.data.name, input });
      continue;
    }
    if (e.type !== "tool_result" || e.data.is_error) continue;
    const use = uses.get(e.data.tool_use_id);
    if (!use) continue;
    const id = visualIdOf(e.data.content);
    const code = textOf(use.input.code);
    if (!id || code === null) continue;
    if (use.name === AI_SHOW_VISUAL_TOOL) {
      if (!isKind(use.input.kind)) continue;
      visuals.set(id, { id, kind: use.input.kind, code, title: textOf(use.input.title), shownBy: e.data.tool_use_id, updatedBy: [] });
    } else {
      const shown = visuals.get(id);
      if (!shown) continue;
      visuals.set(id, { ...shown, code, title: textOf(use.input.title) ?? shown.title, updatedBy: [...shown.updatedBy, e.data.tool_use_id] });
    }
  }
  return visuals;
}

/** 記録の行に出す文（「構成図（SVG）」） */
export function describeVisual(input: Record<string, unknown>): string {
  const title = textOf(input.title)?.trim();
  const kind = isKind(input.kind) ? VISUAL_KIND_LABELS[input.kind] : null;
  return [title, kind ? `（${kind}）` : ""].filter(Boolean).join("");
}
