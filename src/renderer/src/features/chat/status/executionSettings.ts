import type { Chat, ChatEvent, ProviderId } from "@shared/types";

export interface WorkingExecutionOptions {
  provider: ProviderId;
  model: string | null;
  effort: string | null;
  permission: string;
  fastRequested: boolean;
}

/** この作業の開始通知だけを読む。前の作業の値を、起動待ちの間に今の値として見せない。 */
export function workingExecutionOf(chat: Chat, events: readonly ChatEvent[]): WorkingExecutionOptions {
  const started = chat.turn_started_at ? Date.parse(chat.turn_started_at) : NaN;
  let init: Extract<ChatEvent, { type: "init" }> | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === "result" || event.type === "error") break;
    if (event.type === "init" && Number.isFinite(started) && Date.parse(event.created_at) >= started) {
      init = event;
      break;
    }
  }
  return {
    provider: chat.provider,
    model: init?.data.model ?? chat.model,
    effort: init?.data.effort !== undefined ? init.data.effort : chat.effort,
    permission: init?.data.permission_mode ?? chat.permission_mode,
    // Fast は指定したかだけが分かり、実際に適用されたかは作業中には分からないことがある。
    fastRequested: chat.fast_mode,
  };
}
