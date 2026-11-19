import type { SelfGuardRules } from "./platformRules";

/** macOS の、自分を止める・操作するコマンドの見分け方 */
export const MACOS_SELF_GUARD: SelfGuardRules = { killByName: /\b(pkill|killall)\b/, scripting: { pattern: /\bosascript\b/, label: "AppleScript" } };
