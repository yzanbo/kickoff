import type { Chat, ChatOptions } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";

/** 確認画面に出す条件。confirmation は、確定前に条件が変わっていないかを確かめる印。 */
export interface ProviderSwitchPreview {
  chat_id: number;
  from: ProviderId;
  to: ProviderId;
  options: ChatOptions;
  queued_ids: string[];
  paused: boolean;
  stops: number[];
  busy_child_ids: number[];
  last_event_id: number | null;
  workdir: string;
  sandbox_enabled: boolean;
  edit_scope_enabled: boolean;
  confirmation: string;
}

export interface ProviderHandoffStatus {
  event_id: number;
  provider: ProviderId;
  state: "ready" | "blocked" | "sending" | "uncertain";
  error: string | null;
  context: string;
}

export interface ProviderSwitchResult {
  chat: Chat;
  warning: string | null;
}
