import { Bot } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { PERMISSION_LABELS, PROVIDER_IDS, type Chat, type ProviderId, type ProviderStatus } from "@shared/types";
import { useProviders } from "@/stores/providers";
import { ChipPicker } from "@/ui/ChipPicker";
import { turnsApi } from "@/api/turns";
import { alertDialog, confirmDialog, reportFailure } from "@/ui/dialogs";
import { PAY_PER_USE_LABEL, paysPerUse, providerChipName, providerLabel, providerPickBlock, providerSwitchBlock, statusOf } from "./providerChoice";

/** AI の札の色（グループの札と同じ形に、AI ごとの色 --group-hue） */
const PROVIDER_HUES: Record<ProviderId, number> = { claude: 20, codex: 160, copilot: 280, cursor: 210, gemini: 45 };

/** 札に乗せたときの説明の後ろ（API キーで動かすなら、使った分の支払いであることを添える） */
const payNote = (status: ProviderStatus | undefined) => (paysPerUse(status) ? `。API キーで動かします（${PAY_PER_USE_LABEL}）` : "");

/**
 * 送る前の新しいチャット・新しい子チャットの見出しで、使う AI を選ぶ札（メモの仕様書「0021」の Q1・Q8）。
 * 選べるのは Kickoff のチャットで使える AI だけで、対応予定のもの・API キーが要るのに置いていないものは押せない形で理由を出す。
 * 始めたあとの Claude Code・Codex 間の切り替えはチャットの見出しから行う。
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

/** チャットの見出しの AI の札。Claude Code と Codex は確認してから切り替える。 */
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
  const change = async (target: "claude" | "codex") => {
    if (target === provider) return;
    setSwitching(true);
    try {
      const preview = await turnsApi.providerSwitchPreview(chat.id, target);
      const ok = await confirmDialog({ title: `${labels[target]} に切り替えますか？`, confirmLabel: "切り替える", message: [
        `権限モード: ${PERMISSION_LABELS[preview.options.permission_mode]}`,
        `送信待ち: ${preview.queued_ids.length} 件（切り替え後の AI に送ります）`,
        preview.busy_child_ids.length ? `同じ作業場所で子チャット ${preview.busy_child_ids.length} 件が作業中です。子チャットはそのまま続きます。` : "",
        "切り替え前の会話には巻き戻し・分岐・ファイル復元ができなくなります。",
        "会話の引き継ぎは、切り替え後の最初の指示に添えます。",
      ].filter(Boolean).join("\n") });
      if (!ok) return;
      const result = await turnsApi.switchProvider(chat.id, target, preview.confirmation);
      if (result.warning) await alertDialog("AI を切り替えました", result.warning);
    } catch (error) { await reportFailure("AI を切り替えられませんでした")(error); }
    finally { setSwitching(false); }
  };
  if (supported) return <ChipPicker className="chat-group-chip chat-provider-chip" hue={PROVIDER_HUES[provider]} icon={Bot} name={providerChipName(provider, status)} tip="このチャットの AI を切り替える" menuTitle="使う AI" values={["claude", "codex"] as const} labels={labels} value={provider} disabled={disabled} inactive={chat.archived_at ? "アーカイブ済みのチャットは切り替えられません" : busy ? "作業が終わってから切り替えてください" : switching ? "切り替え中です" : null} onPick={(target) => void change(target)} />;
  return (
    <span
      className="chat-group-chip chat-provider-chip"
      style={{ "--group-hue": PROVIDER_HUES[provider] } as CSSProperties}
      data-tip={`このチャットの AI: ${providerLabel(provider, status)}（この AI の切り替えには未対応です）${payNote(status)}`}
    >
      <Bot size={11} aria-hidden />
      <span className="chip-name">{providerChipName(provider, status)}</span>
    </span>
  );
}
