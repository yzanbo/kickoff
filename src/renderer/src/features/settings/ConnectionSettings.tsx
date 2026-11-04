import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { ErrorText } from "@/ui/ErrorText";
import { GitHubStatusCard, StatusCard } from "@/ui/StatusCard";

/** 設定: AI エージェントと GitHub の CLI のログイン状態 */
export function ConnectionSettings() {
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  return (
    <section className="section">
      <div className="section-head">
        <h2>接続</h2>
        <button
          className="btn"
          onClick={() => {
            providers.reload();
            github.reload();
          }}
        >
          再確認
        </button>
      </div>
      <p className="muted small">AI エージェントと GitHub は、Mac にインストールされた各 CLI のログインをそのまま使います（API キーは不要です）。</p>
      <div className="card-grid">
        {providers.loading && !providers.data ? (
          <StatusCard title="AI エージェント" ok={undefined} detail="確認中…" />
        ) : (
          providers.data?.map((p) => (
            <StatusCard
              key={p.id}
              title={p.label}
              ok={p.implemented ? p.loggedIn : null}
              badge={p.implemented ? undefined : "対応予定"}
              detail={
                <>
                  {p.detail}
                  {p.account && <div className="muted small">{p.account}</div>}
                </>
              }
            />
          ))
        )}
        <GitHubStatusCard github={github} />
      </div>
      <ErrorText message={providers.error} />
    </section>
  );
}
