import { useState } from "react";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import { providerSwitchLine } from "@shared/providerSwitch/providerSwitch";
import { useQuery } from "@/foundation/ui/query/useQuery";
import { providerSwitchApi } from "./api";

/** 開いたときに最新の記録を読み直し、準備中と応答を受け取った内容を区別する。 */
export function ProviderSwitchRecord({ event }: { event: ChatEventOf<"provider_switched"> }) {
  const [open, setOpen] = useState(false);
  const record = useQuery(["ProviderSwitchRecord", event.chat_id, event.id], () => providerSwitchApi("GET /api/chats/:chatId/provider-handoff/:eventId", { params: { chatId: event.chat_id, eventId: event.id } }), { enabled: open, keepPrevious: true });
  const latest = record.data?.event ?? event;
  const pending = record.data?.pending ?? null;
  const error = record.error ? "最新の状態を確認できませんでした。" : null;
  return <div className="provider-switch-record" id={`ev-${event.id}`}>
    <div className="workplace-moved-divider divider-label" role="separator" aria-label="AI を切り替えました"><span>{providerSwitchLine(event.data)}</span></div>
    {event.data.handoff_context !== undefined && <details className="provider-switch-details" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>引き継ぎ内容を確認</summary>
      <p>{error ?? (pending?.state === "uncertain" ? "AI が受け取ったか確認できません。" : pending?.state === "blocked" ? `準備できていません: ${pending.error ?? "理由を確認してください"}` : latest.data.handoff_status === "delivered" ? "この内容を添えた指示への応答を受け取りました。" : latest.data.handoff_status === "superseded" ? "指示を送る前に別の AI へ切り替えたため、この内容は渡していません。" : "準備した内容です。まだ引き継ぎが完了したとは限りません。")}</p>
      <pre>{latest.data.handoff_context}</pre>
    </details>}
  </div>;
}
