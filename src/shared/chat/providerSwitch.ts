import type { ChatEvent, ChatEventDataOf } from "@shared/types";

/** これより後に AI の交代がある記録は、巻き戻し・分岐・ファイル復元の対象にできない。 */
export function isBeforeProviderSwitch(events: readonly ChatEvent[], eventId: number): boolean {
  return events.some((e) => e.type === "provider_switched" && e.id > eventId);
}

export const PROVIDER_REWIND_LOCKED = "AI を切り替える前の発言なので巻き戻せません";
export const PROVIDER_FORK_LOCKED = "AI を切り替える前の地点なので分岐できません";
export const PROVIDER_FILES_LOCKED = "AI を切り替える前の発言なので、ファイルは戻せません";

export function providerSwitchLine(data: ChatEventDataOf<"provider_switched">): string {
  const name = (id: string) => id === "claude" ? "Claude Code" : id === "codex" ? "Codex" : id;
  return `${name(data.from)} → ${name(data.to)} に切り替えました`;
}
