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

/** これより後に AI の交代がある記録は、巻き戻し・分岐・ファイル復元の対象にできない。 */
export function isBeforeProviderSwitch(events: readonly ChatEvent[], eventId: number): boolean {
  return events.some((e) => e.type === "provider_switched" && e.id > eventId);
}

export const PROVIDER_REWIND_LOCKED = "AI を切り替える前の発言なので巻き戻せません";
export const PROVIDER_FORK_LOCKED = "AI を切り替える前の地点なので分岐できません";
export const PROVIDER_FILES_LOCKED = "AI を切り替える前の発言なので、ファイルは戻せません";

/** AI の交代の区切りの文（名前は AI の名前の一覧。一覧にない ID はそのまま） */
export function providerSwitchLine(data: ChatEventDataOf<"provider_switched">): string {
  const name = (id: ProviderId) => PROVIDER_LABELS[id] ?? id;
  return `${name(data.from)} → ${name(data.to)} に切り替えました`;
}
