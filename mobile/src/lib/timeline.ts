// スマホのチャットの画面に出す行（縦 1 列。メインエージェントの発言・ツールの 1 行・終わり。サブエージェントの中身は出さない）。
// 記録（ChatEvent）を持ち、本体の知らせ（chat_event・chat_events_deleted・chat_delta）でその場で直す。純粋な関数でテストする
import type { BusEvent, ChatEvent, TurnEndStatus } from "@shared/types";
import { AI_SHOW_VISUAL_TOOL, AI_UPDATE_VISUAL_TOOL, collectVisuals, visualIdOf, type ChatVisual } from "@shared/chat/aiVisual";
import { hasMath } from "./richPages";

export type TimelineItem =
  | { kind: "user"; id: number; text: string; note: string | null }
  /** math: 数式を含む（WebView で描く） */
  | { kind: "assistant"; id: number; text: string; math: boolean }
  /** AI が描いた図（いちばん新しい中身。書いている途中・失敗なら visual が null で text に様子） */
  | { kind: "visual"; id: number; visual: ChatVisual | null; text: string }
  | { kind: "tool"; id: number; name: string; summary: string; state: "running" | "ok" | "error" }
  | { kind: "answer"; id: number; text: string }
  | { kind: "end"; id: number; status: string; text: string | null }
  | { kind: "notice"; id: number; text: string };

/** 記録を足す（同じ ID は後から届いたもので置き換え、ID の順に並べる） */
export function mergeEvents(current: readonly ChatEvent[], incoming: readonly ChatEvent[]): ChatEvent[] {
  if (incoming.length === 0) return current as ChatEvent[];
  const byId = new Map(current.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** そのチャットの記録への本体の知らせを当てる（関係のない知らせなら同じ配列を返す） */
export function applyEventToLog(events: readonly ChatEvent[], chatId: number, e: BusEvent): ChatEvent[] {
  if (e.type === "chat_event" && e.event.chat_id === chatId) return mergeEvents(events, [e.event]);
  if (e.type === "chat_events_deleted" && e.chat_id === chatId) return events.filter((x) => x.id < e.from_event_id);
  return events as ChatEvent[];
}

/** ツールの呼び出しの 1 行の説明（コマンド・パス・頼みの文など、入力のうち分かりやすいもの 1 つ） */
export function toolSummary(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const pick = ["command", "file_path", "path", "pattern", "url", "description", "query", "prompt"].map((k) => i[k]).find((v) => typeof v === "string" && v.trim());
  const text = typeof pick === "string" ? pick.replace(/\s+/g, " ").trim() : "";
  return text.length > 120 ? `${text.slice(0, 119)}…` : text || name;
}

const END_LABELS: Record<TurnEndStatus, string> = { completed: "終わりました", failed: "失敗しました", cancelled: "止めました" };

/** 記録から画面の行を作る（サブエージェントの中の発言・ツール・思考・セッションの始まりは出さない） */
export function timelineOf(events: readonly ChatEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const tools = new Map<string, Extract<TimelineItem, { kind: "tool" }>>();
  // AI が描いた図（描いた呼び出しの位置に、いちばん新しい中身で出す。描き直しの位置は 1 行のお知らせ）
  const visuals = collectVisuals(events);
  const visualCalls = new Map<string, Extract<TimelineItem, { kind: "visual" | "notice" }>>();
  for (const e of events) {
    switch (e.type) {
      case "user": {
        const d = e.data;
        const note = d.pre_compact ? "圧縮前指示" : d.post_compact ? "圧縮後指示" : d.handoff_from ? `「${d.handoff_from.title}」から` : null;
        items.push({ kind: "user", id: e.id, text: d.text, note });
        break;
      }
      case "text":
        if (!e.data.parent && e.data.text.trim()) items.push({ kind: "assistant", id: e.id, text: e.data.text, math: hasMath(e.data.text) });
        break;
      case "tool_use":
        if (!e.data.parent && (e.data.name === AI_SHOW_VISUAL_TOOL || e.data.name === AI_UPDATE_VISUAL_TOOL)) {
          const item =
            e.data.name === AI_SHOW_VISUAL_TOOL
              ? { kind: "visual" as const, id: e.id, visual: null, text: "図を描いています…" }
              : { kind: "notice" as const, id: e.id, text: "図を描き直しています…" };
          visualCalls.set(e.data.id, item);
          items.push(item);
        } else if (!e.data.parent) {
          const item = { kind: "tool" as const, id: e.id, name: e.data.name, summary: toolSummary(e.data.name, e.data.input), state: "running" as const };
          tools.set(e.data.id, item);
          items.push(item);
        }
        break;
      case "tool_result": {
        const item = tools.get(e.data.tool_use_id);
        if (item) item.state = e.data.is_error ? "error" : "ok";
        const drawn = visualCalls.get(e.data.tool_use_id);
        if (drawn) {
          const visual = visuals.get(visualIdOf(e.data.content) ?? "");
          if (e.data.is_error || !visual) drawn.text = drawn.kind === "visual" ? "図を描けませんでした" : "図を描き直せませんでした";
          else if (drawn.kind === "visual") drawn.visual = visual;
          else drawn.text = `${visual.title ? `「${visual.title}」` : "図"}を描き直しました`;
        }
        break;
      }
      case "approval_resolved":
        if (e.data.action === "answer") {
          const text = Object.entries(e.data.answers)
            .map(([q, a]) => `${q}: ${Array.isArray(a) ? a.join("、") : a}`)
            .join("\n");
          items.push({ kind: "answer", id: e.id, text });
        }
        break;
      case "result":
        items.push({ kind: "end", id: e.id, status: END_LABELS[e.data.status], text: e.data.status === "failed" ? (e.data.text ?? null) : null });
        break;
      case "error":
        items.push({ kind: "notice", id: e.id, text: e.data.message });
        break;
      case "notice":
        items.push({ kind: "notice", id: e.id, text: e.data.message });
        break;
      case "compact":
        items.push({ kind: "notice", id: e.id, text: e.data.trigger === "auto" ? "会話を自動で圧縮しました" : "会話を圧縮しました" });
        break;
      case "context_cleared":
        items.push({ kind: "notice", id: e.id, text: "コンテキストを消去しました" });
        break;
      default:
        break;
    }
  }
  return items;
}

/** いちばん新しい記録の ID（つなぎ直したときに ?after= で抜けた分だけ取る。なければ null） */
export const lastEventId = (events: readonly ChatEvent[]): number | null => events.at(-1)?.id ?? null;
