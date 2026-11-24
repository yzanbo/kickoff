import type { ChatEvent, ChatEventDataOf } from "@shared/chat/chatEvent";
import { PROVIDER_LABELS, type ProviderId } from "@shared/settings/types";

export type ProviderBoundary = { id: number; from: ProviderId; to: ProviderId };

/** AI 交代の一覧。境目がなければ、現在の AI がすべての発言の担当になる。 */
export function providerBoundaries(events: readonly ChatEvent[]): ProviderBoundary[] {
  return events.flatMap((event) => event.type === "provider_switched" ? [{ id: event.id, from: event.data.from, to: event.data.to }] : []).sort((a, b) => a.id - b.id);
}

export function providerAtEvent(boundaries: readonly ProviderBoundary[], eventId: number, current: ProviderId): ProviderId {
  let provider = boundaries[0]?.from ?? current;
  for (const boundary of boundaries) {
    if (boundary.id >= eventId) break;
    provider = boundary.to;
  }
  return provider;
}

/** AI の交代の区切りの文（名前は AI の名前の一覧。一覧にない ID はそのまま） */
export function providerSwitchLine(data: ChatEventDataOf<"provider_switched">): string {
  const name = (id: ProviderId) => PROVIDER_LABELS[id] ?? id;
  return `${name(data.from)} → ${name(data.to)} に切り替えました`;
}
