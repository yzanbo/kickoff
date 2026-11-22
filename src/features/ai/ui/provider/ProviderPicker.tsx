import { Bot } from "lucide-react";
import { PROVIDER_IDS, type ProviderId } from "@shared/settings/types";
import { useProviders } from "@/features/ai/ui/stores/providers";
import { ChipPicker } from "@/foundation/ui/kit/ChipPicker";
import { payNote, providerChipName, providerLabel, providerPickBlock, statusOf } from "./providerChoice";
import { PROVIDERS } from "@shared/ai/providers";

/**
 * 送る前の新しいチャット・新しい子チャットのチャット欄（下の行のモデルの左）で、使う AI を選ぶ札。
 * 選べるのは Kickoff のチャットで使える AI だけで、対応予定のもの・API キーが要るのに置いていないものは押せない形で理由を出す。
 * 始めたあとの AI の切り替えは、チャット欄の同じ場所の札（providerSwitch の ProviderSwitchChip）から行う。
 */
export function ProviderPicker({ value, onChange, tipPrefix = "この AI で始めます" }: { value: ProviderId; onChange: (id: ProviderId) => void; tipPrefix?: string }) {
  const statuses = useProviders().data;
  const current = statusOf(statuses, value);
  const labels = Object.fromEntries(PROVIDER_IDS.map((id) => [id, providerChipName(id, statusOf(statuses, id))])) as Record<ProviderId, string>;
  const disabled: Partial<Record<ProviderId, string>> = {};
  for (const id of PROVIDER_IDS) {
    const reason = id === value ? null : providerPickBlock(id, statusOf(statuses, id));
    if (reason) disabled[id] = reason;
  }
  return (
    <ChipPicker
      className="chat-group-chip chat-provider-chip"
      hue={PROVIDERS[value].hue}
      icon={Bot}
      name={labels[value]}
      tip={`${tipPrefix}: ${providerLabel(value, current)}（押すと選び直す）${payNote(current)}`}
      menuTitle="使う AI"
      values={PROVIDER_IDS}
      labels={labels}
      value={value}
      disabled={disabled}
      onPick={onChange}
    />
  );
}
