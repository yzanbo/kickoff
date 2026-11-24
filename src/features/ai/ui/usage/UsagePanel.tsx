import { useAction } from "@/foundation/ui/hooks/useAction";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { usePlannedProviders } from "@/features/ai/ui/provider/plannedProviders";
import { ServiceUsageDetails } from "./ServiceUsageDetails";
import { refreshServiceUsage, useServiceUsage } from "./serviceUsageStore";

/**
 * 設定の「使用状況」: サービスごと（Claude Code・Codex・GitHub Copilot・Cursor・Gemini）の枠。
 * 公式の口だけを使い、見られないサービスは理由と見る方法を出す。
 * 下の帯の使用状況と同じ店を読む（どちらで「更新」しても、両方が同じ値と取得時刻になる）
 */
export function UsagePanel() {
  const services = useServiceUsage();
  // 「更新」は押せなくして「更新中…」を出し、失敗を出す（開いている間の取り直しの失敗は店の error）
  const action = useAction<"refresh">();
  // Kickoff のチャットでまだ使えない AI（GitHub Copilot・Cursor・Gemini）は、今後の対応予定であることを添える
  const planned = usePlannedProviders();

  return (
    <section className="section">
      <div className="section-head">
        <h2>使用状況</h2>
        <button className="btn" disabled={action.busy !== null} onClick={() => void action.run("refresh", refreshServiceUsage)}>
          {action.busy === "refresh" ? "更新中…" : "更新"}
        </button>
      </div>
      <ErrorText message={action.error ?? services.error} />
      {!services.data ? (
        <p className="muted">取得中…</p>
      ) : (
        <>
          {services.data.map((s) => (
            <ServiceUsageDetails key={s.provider} service={s} variant="panel" planned={planned.ids.has(s.provider)} />
          ))}
          <p className="muted small">開いている間は 1 分ごとに自動で更新します。使用枠の確認には各サービスの公式の機能を使います。</p>
        </>
      )}
    </section>
  );
}
