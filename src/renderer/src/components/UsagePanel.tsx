import { formatClock } from "../time";
import { FIVE_HOUR_IDLE, type usePlanUsage } from "../usage";
import { UsageMeter } from "./UsageMeter";

interface Props {
  planUsage: ReturnType<typeof usePlanUsage>;
}

/** ホームに表示する使用状況の詳細（5 時間・週・モデル別の週枠） */
export function UsagePanel({ planUsage }: Props) {
  const { usage, refresh, refreshing } = planUsage;

  return (
    <section className="section">
      <div className="section-head">
        <h2>使用状況{usage?.plan ? `（${usage.plan} プラン）` : ""}</h2>
        <button className="btn" disabled={refreshing} onClick={() => void refresh()}>
          {refreshing ? "更新中…" : "更新"}
        </button>
      </div>
      {!usage ? (
        <p className="muted">取得中…</p>
      ) : !usage.available ? (
        <div className="empty">
          プランの使用枠を取得できませんでした{usage.error ? `（${usage.error}）` : ""}。
        </div>
      ) : (
        <>
          <div className="card-grid">
            <div className="card">
              <UsageMeter window={usage.five_hour} idleText={FIVE_HOUR_IDLE} />
            </div>
            <div className="card">
              <UsageMeter window={usage.seven_day} />
            </div>
            {usage.model_weekly.map((w) => (
              <div className="card" key={w.key}>
                <UsageMeter window={w} />
              </div>
            ))}
          </div>
          <p className="muted small">
            {formatClock(usage.fetched_at)} 時点
            （5 分ごとに自動更新）
            {usage.error && <span className="error">・最新の取得に失敗: {usage.error}</span>}
          </p>
        </>
      )}
    </section>
  );
}
