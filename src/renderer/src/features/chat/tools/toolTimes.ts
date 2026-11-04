// ツールの呼び出しの時刻（いつ始めて、いつ終わったか）。流れのツールの 1 件・まとまりの見出し・サブエージェントのカードで同じ数え方にする
import type { ToolCall } from "@/features/chat/timeline/timelineItems";

/** まとまりの時間（start = 最初に始めた時刻・latestStart = 最後に始めた時刻・end = 最後に終わった時刻） */
export interface ToolSpan {
  start: string;
  latestStart: string;
  /** 結果が届いたいちばん遅い時刻（結果のない呼び出し（中断・実行中）は始めた時刻で数え、範囲から外さない） */
  end: string;
}

const later = (a: string, b: string) => (Date.parse(b) > Date.parse(a) ? b : a);
const earlier = (a: string, b: string) => (Date.parse(b) < Date.parse(a) ? b : a);

/** ツールのまとまりの時間（呼び出しが 1 件以上あること） */
export function toolSpan(tools: readonly ToolCall[]): ToolSpan {
  let start = tools[0].use.created_at;
  let latestStart = start;
  let end = start;
  for (const { use, result } of tools) {
    start = earlier(start, use.created_at);
    latestStart = later(latestStart, use.created_at);
    end = later(end, result?.created_at ?? use.created_at);
  }
  return { start, latestStart, end };
}

/** 呼び出し 1 件にかかった時間（ミリ秒。結果がまだなければ undefined） */
export const callDuration = ({ use, result }: ToolCall): number | undefined =>
  result ? Math.max(0, Date.parse(result.created_at) - Date.parse(use.created_at)) : undefined;
