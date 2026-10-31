import { api, useAsync } from "../api";
import { StatusCard } from "../components/StatusCard";
import { UsagePanel } from "../components/UsagePanel";
import { href } from "../router";
import type { usePlanUsage } from "../usage";

export function HomePage({ planUsage }: { planUsage: ReturnType<typeof usePlanUsage> }) {
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  const claude = providers.data?.find((p) => p.id === "claude");

  return (
    <div className="page">
      <header className="page-header">
        <h1>ようこそ</h1>
        <p className="muted">アイデアからデプロイまで、AI と一緒に進めるための作業場です。</p>
      </header>

      <UsagePanel planUsage={planUsage} />

      <section className="section">
        <h2>準備状況</h2>
        <div className="status-grid">
          <StatusCard
            title="Claude Code"
            ok={providers.loading ? undefined : Boolean(claude?.loggedIn)}
            detail={providers.error ?? claude?.detail ?? "確認中…"}
          />
          <StatusCard
            title="GitHub CLI（gh）"
            ok={github.loading ? undefined : Boolean(github.data?.loggedIn)}
            detail={github.error ?? github.data?.detail ?? "確認中…"}
          />
        </div>
        <p className="muted small">
          詳細は <a href={href({ name: "settings" })}>設定</a> で確認できます。
        </p>
      </section>

      <section className="section">
        <h2>プロジェクト</h2>
        <div className="empty">プロジェクトの作成は次のマイルストーン（M1）で対応します。</div>
      </section>
    </div>
  );
}
