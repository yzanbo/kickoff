import { ARTIFACT_KIND_LABELS, type Artifact } from "../../../../core/types";
import { REPORT_KINDS } from "../../sections";
import { Markdown } from "../Markdown";

/** レポートのタブ（テストレポート・デプロイログなどを、開閉する一覧で出す） */
export function ReportsTab({ artifacts }: { artifacts: Artifact[] }) {
  const reports = artifacts.filter((a) => REPORT_KINDS.includes(a.kind));
  if (reports.length === 0) return <div className="empty">テストレポートやデプロイログはまだありません。</div>;
  return (
    <section className="section">
      {reports.map((a) => (
        <details key={a.id} className="report">
          <summary>
            <span className="badge">{ARTIFACT_KIND_LABELS[a.kind]}</span>
            <span className="report-title">{a.title}</span>
            <span className="muted small">{new Date(a.created_at).toLocaleString("ja-JP")}</span>
          </summary>
          <div className="doc-card">
            <Markdown>{a.content}</Markdown>
          </div>
        </details>
      ))}
    </section>
  );
}
