import { Bot, MousePointer2, Sparkles, SquareTerminal, type LucideIcon } from "lucide-react";
import { PROVIDERS } from "@shared/ai/providers";
import type { ProviderId } from "@shared/settings/types";
import { ClaudeMark } from "@/features/ai/ui/ClaudeMark";

/** 頭文字の印（表の mark が letter）の AI のアイコン（プロジェクトの設定の AI のカード・チャット欄のモデルの欄で同じもの。表にないものは Bot） */
const PROVIDER_ICONS: Partial<Record<ProviderId, LucideIcon>> = {
  codex: SquareTerminal,
  copilot: Bot,
  cursor: MousePointer2,
  gemini: Sparkles,
};

/** AI のアイコン（表の mark が claude なら Claude の印） */
export function ProviderIcon({ provider, size = 14 }: { provider: ProviderId; size?: number }) {
  if (PROVIDERS[provider].mark === "claude") return <ClaudeMark size={size} />;
  const Icon = PROVIDER_ICONS[provider] ?? Bot;
  return <Icon size={size} aria-hidden />;
}
