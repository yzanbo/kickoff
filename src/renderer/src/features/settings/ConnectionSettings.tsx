import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { githubStore, providersStore, useGitHubStatus, useProviders } from "@/stores/providers";
import { ServerInfoRows } from "@/features/footer/ServerInfo";
import { ErrorText } from "@/ui/ErrorText";
import { GitHubStatusCard, StatusCard } from "@/ui/StatusCard";
import { PLANNED_BADGE, usePlannedProviders } from "./plannedProviders";

/**
 * 設定: Kickoff サーバー（アドレス・起動した時刻・実行中のエージェント・スマホ連携）と、AI エージェントと GitHub の CLI のログイン状態。
 * 下の帯の接続の札はつながらないときだけ出すので、つながっている間のサーバーの中身はここで見る
 */
export function ConnectionSettings() {
  // 開くたびに確かめ直す（届くまでは前に確かめた内容を出す）
  const providers = useProviders();
  const github = useGitHubStatus();
  const planned = usePlannedProviders();
  const server = useAsync(() => api.status(), []);
  return (
    <section className="section">
      <div className="section-head">
        <h2>接続</h2>
        <button
          className="btn"
          onClick={() => {
            server.reload();
            void providersStore.reload();
            void githubStore.reload();
          }}
        >
          再確認
        </button>
      </div>
      <p className="muted small">AI エージェントと GitHub は、Mac にインストールされた各 CLI のログインをそのまま使います（API キーは不要です）。</p>
      {planned.note && <p className="muted small">{planned.note}いまは CLI が入っているかだけを確かめます。</p>}
      <div className="card-grid">
        <StatusCard
          title="Kickoff サーバー"
          ok={server.data ? true : server.error ? false : undefined}
          detail={
            server.data ? (
              <dl className="conn-list">
                <ServerInfoRows server={server.data} />
              </dl>
            ) : (
              (server.error ?? "確認中…")
            )
          }
        />
        {providers.loading && !providers.data ? (
          <StatusCard title="AI エージェント" ok={undefined} detail="確認中…" />
        ) : (
          providers.data?.map((p) => (
            <StatusCard
              key={p.id}
              title={p.label}
              ok={p.implemented ? p.logged_in : null}
              badge={p.implemented ? undefined : PLANNED_BADGE}
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
