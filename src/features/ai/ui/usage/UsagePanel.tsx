import { useEffect, useEffectEvent, useState } from "react";
import type { ServiceUsage } from "@shared/ai/types";
import { api } from "@/foundation/ui/api";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { usePlannedProviders } from "@/features/ai/ui/provider/plannedProviders";
import { ServiceUsageDetails } from "./ServiceUsageDetails";

/** 開いている間に取り直す間隔 */
const POLL_MS = 5 * 60_000;

/**
 * 設定の「使用状況」: サービスごと（Claude Code・Codex・GitHub Copilot・Cursor・Gemini）の枠。
 * 各サービスのログイン情報を読むだけなので、見られないサービスは理由と見る方法を出す
 */
export function UsagePanel() {
  const [services, setServices] = useState<ServiceUsage[]>();
  // 開いている間の取り直しは失敗だけを出し、「更新」は押せなくして「更新中…」を出す
  const action = useAction<"refresh">();
  // Kickoff のチャットでまだ使えない AI（GitHub Copilot・Cursor・Gemini）は、使用状況は見られるが今後の対応予定であることを添える
  const planned = usePlannedProviders();

  const load = useEffectEvent(() => void action.guard(async () => setServices(await api.usageServices())));
  useEffect(() => {
    load();
    const timer = setInterval(() => load(), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const refresh = () => action.run("refresh", async () => setServices(await api.refreshUsageServices()));

  return (
    <section className="section">
      <div className="section-head">
        <h2>使用状況</h2>
        <button className="btn" disabled={action.busy !== null} onClick={() => void refresh()}>
          {action.busy === "refresh" ? "更新中…" : "更新"}
        </button>
      </div>
      <ErrorText message={action.error} />
      {!services ? (
        <p className="muted">取得中…</p>
      ) : (
        <>
          {services.map((s) => (
            <ServiceUsageDetails key={s.id} service={s} variant="panel" planned={planned.ids.has(s.id)} />
          ))}
          <p className="muted small">開いている間は 5 分ごとに自動で更新します。各サービスのログイン情報は読むだけで、書き換えません。</p>
        </>
      )}
    </section>
  );
}
