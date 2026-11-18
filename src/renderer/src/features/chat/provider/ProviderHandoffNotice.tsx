import { useCallback, useEffect, useState } from "react";
import type { ProviderHandoffStatus } from "@shared/types";
import { turnsApi } from "@/api/turns";
import { alertDialog, confirmDialog, reportFailure } from "@/ui/dialogs";

async function retryHandoff(chatId: number, handoff: ProviderHandoffStatus, refresh: () => Promise<void>): Promise<void> {
  try {
    const result = handoff.state === "uncertain" ? await turnsApi.confirmResendProviderHandoff(chatId, handoff.event_id) : await turnsApi.retryProviderHandoff(chatId, handoff.event_id);
    await refresh();
    if (result.warning) await alertDialog("引き継ぎについて", result.warning);
  } catch (error) { await refresh().catch(() => {}); await reportFailure("引き継ぎを再試行できませんでした")(error); }
}

/** 送信を止めた理由と、利用者が明示的に選ぶ復旧操作。 */
export function ProviderHandoffNotice({ chatId, visible }: { chatId: number; visible: boolean }) {
  const [handoff, setHandoff] = useState<ProviderHandoffStatus | null>(null);
  const [working, setWorking] = useState(false);
  const refresh = useCallback(async () => setHandoff(await turnsApi.providerHandoff(chatId)), [chatId]);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    const update = async () => {
      try { const value = await turnsApi.providerHandoff(chatId); if (active) setHandoff(value); } catch { /* 切断中は前の表示を残す */ }
    };
    void update();
    const timer = window.setInterval(() => void update(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [chatId, visible]);
  if (!handoff || (handoff.state !== "blocked" && handoff.state !== "uncertain")) return null;
  const uncertain = handoff.state === "uncertain";
  const retry = async () => {
    if (uncertain && !await confirmDialog({ title: "同じ指示を再送しますか？", message: "AI がすでに指示を受け取っていた場合、同じ作業が二重に実行される可能性があります。作業場所と会話を確認してから選んでください。", confirmLabel: "重複の可能性を確認して再送", danger: true })) return;
    setWorking(true);
    void retryHandoff(chatId, handoff, refresh).finally(() => setWorking(false));
  };
  return <div className="provider-handoff-notice" role="alert">
    <div><strong>{uncertain ? "AI が指示を受け取ったか確認できません" : "AI への引き継ぎを準備できませんでした"}</strong><br />{handoff.error ?? "確認するまで次の指示は送られません。"}</div>
    <button type="button" className="btn" disabled={working} onClick={() => void retry()}>{working ? "準備中…" : uncertain ? "確認して再送" : "再試行"}</button>
  </div>;
}
