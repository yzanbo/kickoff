import "./ProviderSwitchRecord.css";
import { useState } from "react";
import type { ProviderHandoffStatus } from "@shared/providerSwitch/types";
import { useChatDetail } from "@/features/chat/ui";
import { alert as askAlert, confirm, reportFailure } from "@/foundation/ui/kit/ask";
import { Notice } from "@/foundation/ui/kit/Notice";
import { useQuery } from "@/foundation/ui/query/useQuery";
import { providerSwitchApi } from "./api";

async function retryHandoff(chatId: number, handoff: ProviderHandoffStatus, refresh: () => Promise<void>): Promise<void> {
  try {
    const body = { event_id: handoff.event_id };
    const result = handoff.state === "uncertain"
      ? await providerSwitchApi("POST /api/chats/:chatId/provider-handoff/confirm-resend", { params: { chatId }, body: { ...body, confirm_duplicate_risk: true } })
      : await providerSwitchApi("POST /api/chats/:chatId/provider-handoff/retry", { params: { chatId }, body });
    await refresh();
    if (result.warning) await askAlert("引き継ぎについて", result.warning);
  } catch (error) { await refresh(); await reportFailure("引き継ぎを再試行できませんでした")(error); }
}

/**
 * 送信を止めた理由と、利用者が明示的に選ぶ復旧操作。
 * 止まっているかは作業中の様子の provider_handoff で知り、止まっている間だけ理由（error）と区切りの ID を読む（切断中・失敗は前の表示を残す）
 */
export function ProviderHandoffNotice({ chatId, visible }: { chatId: number; visible: boolean }) {
  const gate = useChatDetail(chatId).live.provider_handoff?.state ?? null;
  const stuck = gate === "blocked" || gate === "uncertain";
  const query = useQuery(stuck ? ["ProviderHandoffNotice", chatId, gate] : null, () => providerSwitchApi("GET /api/chats/:chatId/provider-handoff", { params: { chatId } }), { enabled: visible, keepPrevious: true });
  const [working, setWorking] = useState(false);
  const handoff = stuck ? query.data : null;
  if (!handoff || (handoff.state !== "blocked" && handoff.state !== "uncertain")) return null;
  const uncertain = handoff.state === "uncertain";
  const retry = async () => {
    if (uncertain && !await confirm({ title: "同じ指示を再送しますか？", message: "AI がすでに指示を受け取っていた場合、同じ作業が二重に実行される可能性があります。作業場所と会話を確認してから選んでください。", confirmLabel: "重複の可能性を確認して再送", danger: true })) return;
    setWorking(true);
    void retryHandoff(chatId, handoff, query.reload).finally(() => setWorking(false));
  };
  return <Notice look="band" className="provider-handoff-notice" role="alert">
    <div><strong>{uncertain ? "AI が指示を受け取ったか確認できません" : "AI への引き継ぎを準備できませんでした"}</strong><br />{handoff.error ?? "確認するまで次の指示は送られません。"}</div>
    <button type="button" className="btn" disabled={working} onClick={() => void retry()}>{working ? "準備中…" : uncertain ? "確認して再送" : "再試行"}</button>
  </Notice>;
}
