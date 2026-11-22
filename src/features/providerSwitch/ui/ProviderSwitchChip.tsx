import { Bot } from "lucide-react";
import type { CSSProperties } from "react";
import { PROVIDERS, SWITCHABLE_PROVIDERS, type SwitchableProvider } from "@shared/ai/providers";
import type { ProviderStatus } from "@shared/ai/types";
import { PERMISSION_LABELS, type ProviderId } from "@shared/settings/types";
import { payNote, providerChipName, providerLabel, providerSwitchBlock, statusOf, useProviders } from "@/features/ai/ui";
import { useActionButton } from "@/features/chat/ui";
import { ChipPicker } from "@/foundation/ui/kit/ChipPicker";
import { alert, confirm } from "@/foundation/ui/kit/ask";
import { providerSwitchApi } from "./api";

/** 確かめのダイアログ（権限モード・送信待ち・作業中の子チャット・巻き戻せなくなること）を出してから切り替える */
async function switchWithConfirmation(chatId: number, target: SwitchableProvider, label: string): Promise<void> {
  const preview = await providerSwitchApi("GET /api/chats/:chatId/provider-switch", { params: { chatId }, query: { target } });
  const ok = await confirm({ title: `${label} に切り替えますか？`, confirmLabel: "切り替える", message: [
    `${label} の権限モード: ${PERMISSION_LABELS[preview.options.permission_mode]}`,
    preview.queued_ids.length ? `送信待ちの ${preview.queued_ids.length} 件は、切り替え後の ${label} に送ります。` : "",
    preview.busy_child_ids.length ? `同じ作業場所で子チャット ${preview.busy_child_ids.length} 件が作業中です。子チャットはそのまま続きます。` : "",
    "切り替え前の会話には巻き戻し・分岐・ファイル復元ができなくなります。",
    "会話の引き継ぎは、切り替え後の最初の指示に添えます。",
  ].filter(Boolean).join("\n") });
  if (!ok) return;
  const result = await providerSwitchApi("POST /api/chats/:chatId/provider-switch", { params: { chatId }, body: { target, confirmation: preview.confirmation } });
  if (result.warning) await alert("AI を切り替えました", result.warning);
}

/** 札が見るチャットの欄（chat の Chat の型を読まず、要る欄だけを受ける） */
interface ProviderSwitchChipChat {
  id: number;
  provider: ProviderId;
  archived_at: string | null;
}

const isSwitchable = (id: ProviderId): id is SwitchableProvider => (SWITCHABLE_PROVIDERS as readonly ProviderId[]).includes(id);

/**
 * 札のメニュー（純粋）: 替えられる AI の名前と、選べない理由（いまの AI は選べる）、押せない理由（アーカイブ済み・作業中・切り替え中。押せるなら null）。
 * いまの AI が替えられない AI なら null（押せない札だけ出す）
 */
export function providerSwitchMenu(chat: ProviderSwitchChipChat, statuses: readonly ProviderStatus[] | undefined, state: { busy: boolean; switching: boolean }) {
  if (!isSwitchable(chat.provider)) return null;
  const labels = Object.fromEntries(SWITCHABLE_PROVIDERS.map((id) => [id, providerChipName(id, statusOf(statuses, id))])) as Record<SwitchableProvider, string>;
  const disabled: Partial<Record<SwitchableProvider, string>> = {};
  for (const id of SWITCHABLE_PROVIDERS) {
    const reason = id === chat.provider ? null : providerSwitchBlock(statusOf(statuses, id));
    if (reason) disabled[id] = reason;
  }
  const inactive = chat.archived_at ? "アーカイブ済みのチャットは切り替えられません" : state.busy ? "作業が終わってから切り替えてください" : state.switching ? "切り替え中です" : null;
  return { value: chat.provider, labels, disabled, inactive };
}

/** チャット欄（下の行のモデルの左）の AI の札。切り替えられる AI（表の "switch"）どうしは確認してから切り替える */
export function ProviderSwitchChip({ chat, busy }: { chat: ProviderSwitchChipChat; busy: boolean }) {
  const provider = chat.provider;
  const statuses = useProviders().data;
  const status = statusOf(statuses, provider);
  const action = useActionButton();
  const menu = providerSwitchMenu(chat, statuses, { busy, switching: action.pending() });
  if (menu) {
    const change = (target: SwitchableProvider) => {
      if (target !== provider) action.press("", () => switchWithConfirmation(chat.id, target, menu.labels[target]), "AI を切り替えられませんでした");
    };
    return <ChipPicker className="chat-group-chip chat-provider-chip" hue={PROVIDERS[provider].hue} icon={Bot} name={providerChipName(provider, status)} tip="このチャットの AI を切り替える" menuTitle="使う AI" values={SWITCHABLE_PROVIDERS} labels={menu.labels} value={menu.value} disabled={menu.disabled} inactive={menu.inactive} onPick={change} />;
  }
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
