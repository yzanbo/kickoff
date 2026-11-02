import { FIVE_HOUR_IDLE, planName, usageUnavailableText, type usePlanUsage } from "../usage";
import { UsageFetchedNote } from "./UsageFetchedNote";
import { UsageMeter } from "./UsageMeter";

interface Props {
  planUsage: ReturnType<typeof usePlanUsage>;
}

/** 設定に表示する使用状況の詳細（5 時間・週・モデル別の週枠） */
export function UsagePanel({ planUsage }: Props) {
  const { usage, refresh, refreshing } = planUsage;

  const plan = planName(usage);
  return (
    <section className="section">
      <div className="section-head">
        <h2>使用状況{plan ? `（${plan}）` : ""}</h2>
        <button className="btn" disabled={refreshing} onClick={() => void refresh()}>
          {refreshing ? "更新中…" : "更新"}
        </button>
      </div>
      {!usage ? (
        <p className="muted">取得中…</p>
      ) : !usage.available ? (
        <div className="empty">
          {usageUnavailableText(usage)}
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
          <UsageFetchedNote usage={usage} />
        </>
      )}
    </section>
  );
}
