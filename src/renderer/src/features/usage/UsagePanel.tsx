import { useEffect, useState } from "react";
import type { ServiceUsage } from "@shared/types";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { formatClock } from "@/lib/time";
import { FIVE_HOUR_IDLE, planLabel } from "./usage";
import { ErrorText } from "@/ui/ErrorText";
import { StatusDot, toneOf } from "@/ui/StatusDot";
import { UsageMeter } from "./UsageMeter";
import { PLANNED_BADGE, usePlannedProviders } from "@/features/settings/plannedProviders";

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
  // Kickoff のチャットでまだ使えない AI（Codex・Gemini）は、使用状況は見られるが今後の対応予定であることを添える
  const planned = usePlannedProviders();

  useEffect(() => {
    const load = () => void action.guard(async () => setServices(await api.usageServices()));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <ServiceBlock key={s.id} service={s} planned={planned.ids.has(s.id)} />
          ))}
          <p className="muted small">開いている間は 5 分ごとに自動で更新します。各サービスのログイン情報は読むだけで、書き換えません。</p>
        </>
      )}
    </section>
  );
}

/** 1 つのサービス: 名前・プラン・アカウントと、枠のメーター（見られなければ理由）。planned: Kickoff のチャットで使うのは今後の対応予定の AI */
function ServiceBlock({ service: s, planned }: { service: ServiceUsage; planned: boolean }) {
  return (
    <div className="usage-service">
      <div className="usage-service-head">
        <StatusDot tone={toneOf(s.status === "ok" ? true : s.status === "error" ? false : null)} />
        <h3>{s.label}</h3>
        {planned && <span className="badge">{PLANNED_BADGE}</span>}
        {s.plan && <span className="plan-chip">{planLabel(s.plan)}</span>}
        {s.account && <span className="muted small usage-service-account">{s.account}</span>}
        {s.status === "ok" && <span className="muted small usage-service-time">{formatClock(s.fetched_at)} 時点</span>}
      </div>
      {s.status === "ok" && s.windows.length > 0 && (
        <div className="card-grid">
          {s.windows.map((w) => (
            <div className="card" key={w.key}>
              <UsageMeter window={w} idleText={s.id === "claude" && w.key === "five_hour" ? FIVE_HOUR_IDLE : undefined} />
            </div>
          ))}
        </div>
      )}
      {planned && <p className="muted small">Kickoff のチャットで {s.label} を使えるようにするのは、今後の対応予定です（いまは使用状況を見られるだけです）。</p>}
      {s.notes.length > 0 && <p className="muted small">{s.notes.join(" ・ ")}</p>}
      {s.message && (s.status === "error" ? <ErrorText message={s.message} /> : <p className="muted small">{s.message}</p>)}
    </div>
  );
}
