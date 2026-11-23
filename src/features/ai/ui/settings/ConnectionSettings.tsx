import { githubStore, providersStore, useGitHubStatus, useProviders } from "@/features/ai/ui/stores/providers";
import { settingsItemsOf } from "@/features/settings/ui";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { StatusCard } from "@/foundation/ui/kit/StatusCard";
import { GitHubStatusCard } from "@/features/ai/ui/GitHubStatusCard";
import { PLANNED_BADGE, usePlannedProviders } from "@/features/ai/ui/provider/plannedProviders";
import { ProviderAuthSettings } from "./ProviderAuthSettings";
import { canBrowserLogin, ProviderLoginButton } from "./ProviderLoginButton";
import { ProviderVersion } from "./ProviderVersion";
import { emitConnectionRecheck } from "./connectionRecheck";

/**
 * 設定: Kickoff サーバーのカード（devices が settingsItems の「connection」に足す）と、AI エージェントと GitHub の CLI のログイン状態。
 * 下の帯の接続の札はつながらないときだけ出すので、つながっている間のサーバーの中身はここで見る
 */
export function ConnectionSettings() {
  // 開くたびに確かめ直す（届くまでは前に確かめた内容を出す）
  const providers = useProviders();
  const github = useGitHubStatus();
  const planned = usePlannedProviders();
  return (
    <section className="section">
      <div className="section-head">
        <h2>接続</h2>
        <button
          className="btn"
          onClick={() => {
            emitConnectionRecheck();
            void providersStore.reload();
            void githubStore.reload();
          }}
        >
          再確認
        </button>
      </div>
      <p className="muted small">AI エージェントと GitHub は、Mac にインストールされた各 CLI のログインをそのまま使います（AI は下の「AI のログインの仕方」で API キーにも切り替えられます）。</p>
      {planned.note && <p className="muted small">{planned.note}いまは CLI が入っているかだけを確かめます。</p>}
      <div className="card-grid">
        {settingsItemsOf("connection").map(({ id, Component }) => (
          <Component key={id} />
        ))}
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
                  <ProviderVersion provider={p} />
                  {canBrowserLogin(p) && <ProviderLoginButton provider={p} />}
                </>
              }
            />
          ))
        )}
        <GitHubStatusCard github={github} />
      </div>
      {providers.data && <ProviderAuthSettings providers={providers.data} />}
      <ErrorText message={providers.error} />
    </section>
  );
}
