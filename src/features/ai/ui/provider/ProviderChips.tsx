import { Bot } from "lucide-react";
import { useState, type CSSProperties } from "react";
import type { ProviderStatus } from "@shared/ai/types";
import type { Chat } from "@shared/chat/types";
import { PERMISSION_LABELS, PROVIDER_IDS, type ProviderId } from "@shared/settings/types";
import { useProviders } from "@/features/ai/ui/stores/providers";
import { ChipPicker } from "@/foundation/ui/kit/ChipPicker";
import { turnsApi } from "@/features/chat/ui/api/turns";
import { alert, confirm, reportFailure } from "@/foundation/ui/kit/ask";
import { PAY_PER_USE_LABEL, paysPerUse, providerChipName, providerLabel, providerPickBlock, providerSwitchBlock, statusOf } from "./providerChoice";
import { PROVIDERS } from "@shared/ai/providers";

/** AI の札の色（グループの札と同じ形に、AI ごとの色 --hue） */

/** 札に乗せたときの説明の後ろ（API キーで動かすなら、使った分の支払いであることを添える） */
const payNote = (status: ProviderStatus | undefined) => (paysPerUse(status) ? `。API キーで動かします（${PAY_PER_USE_LABEL}）` : "");

async function switchWithConfirmation(chatId: number, target: "claude" | "codex", label: string): Promise<void> {
  const preview = await turnsApi.providerSwitchPreview(chatId, target);
  const ok = await confirm({ title: `${label} に切り替えますか？`, confirmLabel: "切り替える", message: [
    `${label} の権限モード: ${PERMISSION_LABELS[preview.options.permission_mode]}`,
    preview.queued_ids.length ? `送信待ちの ${preview.queued_ids.length} 件は、切り替え後の ${label} に送ります。` : "",
    preview.busy_child_ids.length ? `同じ作業場所で子チャット ${preview.busy_child_ids.length} 件が作業中です。子チャットはそのまま続きます。` : "",
    "切り替え前の会話には巻き戻し・分岐・ファイル復元ができなくなります。",
    "会話の引き継ぎは、切り替え後の最初の指示に添えます。",
  ].filter(Boolean).join("\n") });
  if (!ok) return;
  const result = await turnsApi.switchProvider(chatId, target, preview.confirmation);
  if (result.warning) await alert("AI を切り替えました", result.warning);
}

/**
 * 送る前の新しいチャット・新しい子チャットのチャット欄（下の行のモデルの左）で、使う AI を選ぶ札。
 * 選べるのは Kickoff のチャットで使える AI だけで、対応予定のもの・API キーが要るのに置いていないものは押せない形で理由を出す。
 * 始めたあとの Claude Code・Codex 間の切り替えは、チャット欄の同じ場所の札（ProviderChip）から行う。
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

/** チャット欄（下の行のモデルの左）の AI の札。Claude Code と Codex は確認してから切り替える。 */
export function ProviderChip({ chat, busy }: { chat: Chat; busy: boolean }) {
  const provider = chat.provider;
  const statuses = useProviders().data;
  const status = statusOf(statuses, provider);
  const [switching, setSwitching] = useState(false);
  const supported = provider === "claude" || provider === "codex";
  const labels = { claude: providerChipName("claude", statusOf(statuses, "claude")), codex: providerChipName("codex", statusOf(statuses, "codex")) };
  const disabled: Partial<Record<"claude" | "codex", string>> = {};
  for (const id of ["claude", "codex"] as const) {
    const candidate = statusOf(statuses, id);
    const reason = id === provider ? null : providerSwitchBlock(candidate);
    if (reason) disabled[id] = reason;
  }
  const change = (target: "claude" | "codex") => {
    if (target === provider) return;
    setSwitching(true);
    void switchWithConfirmation(chat.id, target, labels[target]).catch(reportFailure("AI を切り替えられませんでした")).finally(() => setSwitching(false));
  };
  if (supported) return <ChipPicker className="chat-group-chip chat-provider-chip" hue={PROVIDERS[provider].hue} icon={Bot} name={providerChipName(provider, status)} tip="このチャットの AI を切り替える" menuTitle="使う AI" values={["claude", "codex"] as const} labels={labels} value={provider} disabled={disabled} inactive={chat.archived_at ? "アーカイブ済みのチャットは切り替えられません" : busy ? "作業が終わってから切り替えてください" : switching ? "切り替え中です" : null} onPick={(target) => void change(target)} />;
  return (
    <span
      className="chat-group-chip tag chat-provider-chip"
      data-look="outline"
      style={{ "--hue": PROVIDERS[provider].hue } as CSSProperties}
      data-tip={`このチャットの AI: ${providerLabel(provider, status)}（この AI の切り替えには未対応です）${payNote(status)}`}
    >
      <Bot size={11} aria-hidden />
      <span className="chip-name">{providerChipName(provider, status)}</span>
    </span>
  );
}
