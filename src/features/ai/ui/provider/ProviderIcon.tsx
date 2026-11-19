import { Bot, MousePointer2, Sparkles, SquareTerminal, type LucideIcon } from "lucide-react";
import type { ProviderId } from "@shared/types";
import { ClaudeMark } from "@/features/ai/ui/ClaudeMark";

/** Claude のほかの AI のアイコン（プロジェクトの設定の AI のカード・チャット欄のモデルの欄で同じもの） */
const PROVIDER_ICONS: Record<Exclude<ProviderId, "claude">, LucideIcon> = {
  codex: SquareTerminal,
  copilot: Bot,
  cursor: MousePointer2,
  gemini: Sparkles,
};

/** AI のアイコン（Claude は Claude の印） */
export function ProviderIcon({ provider, size = 14 }: { provider: ProviderId; size?: number }) {
  if (provider === "claude") return <ClaudeMark size={size} />;
  const Icon = PROVIDER_ICONS[provider];
  return <Icon size={size} aria-hidden />;
}
