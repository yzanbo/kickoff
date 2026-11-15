import { Bot } from "lucide-react";
import type { CSSProperties } from "react";
import { PROVIDER_IDS, type ProviderId, type ProviderStatus } from "@shared/types";
import { useProviders } from "@/stores/providers";
import { ChipPicker } from "@/ui/ChipPicker";
import { PAY_PER_USE_LABEL, paysPerUse, providerChipName, providerLabel, providerPickBlock, statusOf } from "./providerChoice";

/** AI の札の色（グループの札と同じ形に、AI ごとの色 --group-hue） */
const PROVIDER_HUES: Record<ProviderId, number> = { claude: 20, codex: 160, copilot: 280, cursor: 210, gemini: 45 };

/** 札に乗せたときの説明の後ろ（API キーで動かすなら、使った分の支払いであることを添える） */
const payNote = (status: ProviderStatus | undefined) => (paysPerUse(status) ? `。API キーで動かします（${PAY_PER_USE_LABEL}）` : "");

/**
 * 送る前の新しいチャット・新しい子チャットの見出しで、使う AI を選ぶ札（メモの仕様書「0021」の Q1・Q8）。
 * 選べるのは Kickoff のチャットで使える AI だけで、対応予定のもの・API キーが要るのに置いていないものは押せない形で理由を出す。
 * 送ったあとは変えない（チャットの画面では ProviderChip で見せるだけ）
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
      hue={PROVIDER_HUES[value]}
      icon={Bot}
      name={labels[value]}
      tip={`${tipPrefix}: ${providerLabel(value, current)}（押すと選び直す。送ったあとは変えられません）${payNote(current)}`}
      menuTitle="使う AI"
      values={PROVIDER_IDS}
      labels={labels}
      value={value}
      disabled={disabled}
      onPick={onChange}
    />
  );
}

/** チャットの見出しの AI の札（見せるだけ。Claude Code をサブスクで使うふだんのチャットには出さない） */
export function ProviderChip({ provider }: { provider: ProviderId }) {
  const status = statusOf(useProviders({ active: false }).data, provider);
  if (provider === "claude" && !paysPerUse(status)) return null;
  return (
    <span
      className="chat-group-chip chat-provider-chip"
      style={{ "--group-hue": PROVIDER_HUES[provider] } as CSSProperties}
      data-tip={`このチャットの AI: ${providerLabel(provider, status)}（チャットの途中では変えられません）${payNote(status)}`}
    >
      <Bot size={11} aria-hidden />
      <span className="chip-name">{providerChipName(provider, status)}</span>
    </span>
  );
}
