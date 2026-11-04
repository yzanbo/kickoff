import { useEffect, useState } from "react";
import type { ServiceUsage } from "@shared/types";
import { api } from "@/api";
import { useActionError } from "@/hooks/useActionError";
import { formatClock } from "@/lib/time";
import { FIVE_HOUR_IDLE, planLabel } from "./usage";
import { ErrorText } from "@/ui/ErrorText";
import { StatusDot, toneOf } from "@/ui/StatusDot";
import { UsageMeter } from "./UsageMeter";

/** 開いている間に取り直す間隔 */
const POLL_MS = 5 * 60_000;

/**
 * 設定の「使用状況」: サービスごと（Claude Code・Codex・GitHub Copilot・Cursor・Gemini）の枠。
 * 各サービスのログイン情報を読むだけなので、見られないサービスは理由と見る方法を出す
 */
export function UsagePanel() {
  const [services, setServices] = useState<ServiceUsage[]>();
  const [refreshing, setRefreshing] = useState(false);
  const { error, guard } = useActionError();

  useEffect(() => {
    const load = () => void guard(async () => setServices(await api.usageServices()));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await guard(async () => setServices(await api.refreshUsageServices()));
    setRefreshing(false);
  };

  return (
    <section className="section">
      <div className="section-head">
        <h2>使用状況</h2>
        <button className="btn" disabled={refreshing} onClick={() => void refresh()}>
          {refreshing ? "更新中…" : "更新"}
        </button>
      </div>
      <ErrorText message={error} />
      {!services ? (
        <p className="muted">取得中…</p>
      ) : (
        <>
          {services.map((s) => (
            <ServiceBlock key={s.id} service={s} />
          ))}
          <p className="muted small">開いている間は 5 分ごとに自動で更新します。各サービスのログイン情報は読むだけで、書き換えません。</p>
        </>
      )}
    </section>
  );
}

/** 1 つのサービス: 名前・プラン・アカウントと、枠のメーター（見られなければ理由） */
function ServiceBlock({ service: s }: { service: ServiceUsage }) {
  return (
    <div className="usage-service">
      <div className="usage-service-head">
        <StatusDot tone={toneOf(s.status === "ok" ? true : s.status === "error" ? false : null)} />
        <h3>{s.label}</h3>
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
      {s.notes.length > 0 && <p className="muted small">{s.notes.join(" ・ ")}</p>}
      {s.message && (s.status === "error" ? <ErrorText message={s.message} /> : <p className="muted small">{s.message}</p>)}
    </div>
  );
}
