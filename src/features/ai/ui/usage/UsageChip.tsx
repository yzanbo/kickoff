import type { PlanUsage, ProviderStatus } from "@shared/ai/types";
import type { ProviderId } from "@shared/settings/types";
import { ProviderIcon } from "@/features/ai/ui/provider/ProviderIcon";
import { PAY_PER_USE_LABEL, providerChipName, providerLabel } from "@/features/ai/ui/provider/providerChoice";
import { planLabel } from "./usage";
import type { UsageGroup } from "./usageGroups";

/** AI の札に出す文（契約プランが分かればプラン名、分からなければ AI の短い名前。AI はアイコンと色でも分かる） */
export function groupChipText(group: UsageGroup, usage: PlanUsage | undefined, status: ProviderStatus | undefined): string {
  const name = providerChipName(group.provider, undefined);
  switch (group.kind) {
    case "plan":
      return usage?.plan ? planLabel(usage.plan) : name;
    case "service":
      return group.service.plan ? planLabel(group.service.plan) : name;
    case "pay":
      return `${providerLabel(group.provider, status)} · ${PAY_PER_USE_LABEL}`;
    case "missing":
      return name;
  }
}

/** AI の札（アイコン ＋ 文。Claude と Codex は色でも分ける） */
export function UsageChip({ provider, text }: { provider: ProviderId; text: string }) {
  return (
    <span className="footer-usage-chip tag" data-provider={provider}>
      <ProviderIcon provider={provider} size={12} />
      {text}
    </span>
  );
}
