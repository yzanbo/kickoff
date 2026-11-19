import { Check } from "lucide-react";
import { PROVIDER_IDS, type AppSettings, type Project, type ProviderId, type ProviderStatus } from "@shared/types";
import { api } from "@/foundation/ui/api";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { accountLine } from "@/features/ai/ui/usage/usage";
import { useProviders } from "@/features/ai/ui/stores/providers";
import { ProviderIcon } from "@/features/ai/ui/provider/ProviderIcon";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { StatusDot, type StatusTone } from "@/foundation/ui/kit/StatusDot";
import { AiDefaults } from "./AiDefaults";
import { PLANNED_BADGE, usePlannedProviders } from "@/features/ai/ui/settings/plannedProviders";

/** ログインに使う CLI（カードの未ログインの案内） */
const PROVIDER_CLI: Record<ProviderId, string> = { claude: "claude", codex: "codex", copilot: "copilot", cursor: "agent", gemini: "agy" };

/** AI: どの AI を使うか（カード）と、その AI の既定 */
export function AiSection({ project, app }: { project: Project; app: AppSettings | undefined }) {
  const providers = useProviders();
  const planned = usePlannedProviders();
  const { error, guard } = useAction();
  const choose = (id: ProviderId) => guard(() => api.updateProject(project.id, { provider: id }));

  return (
    <section className="section">
      <h2>AI</h2>
      <p className="muted small">このプロジェクトのチャットで初めに使う AI です（新しいチャットごとに選び直せます）。どれも Mac にインストールした CLI のログインをそのまま使います（API キーで動かすときは設定の「接続」）。</p>
      <div className="provider-cards" role="radiogroup" aria-label="使う AI">
        {PROVIDER_IDS.map((id) => (
          <ProviderCard
            key={id}
            id={id}
            status={providers.data?.find((p) => p.id === id)}
            selected={project.provider === id}
            onSelect={() => void choose(id)}
          />
        ))}
      </div>
      {planned.note && <p className="muted small">{planned.note}対応するまでは選べません。</p>}
      <ErrorText message={error} />
      {providers.data?.find((p) => p.id === project.provider)?.implemented !== false ? (
        <AiDefaults project={project} provider={project.provider} app={app} />
      ) : (
        <p className="muted small">この AI の既定の設定は、対応したときにここで選べるようになります。</p>
      )}
    </section>
  );
}

function ProviderCard({
  id,
  status,
  selected,
  onSelect,
}: {
  id: ProviderId;
  status: ProviderStatus | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const ready = status?.implemented && status.installed && status.logged_in;
  const state: { tone: StatusTone; text: string } = !status
    ? { tone: "pending", text: "確認中…" }
    : !status.implemented
      ? { tone: "na", text: status.installed ? "CLI はインストール済み" : "CLI 未インストール" }
      : !status.installed
        ? { tone: "ng", text: "CLI が見つかりません" }
        : status.logged_in
          ? { tone: "ok", text: "ログイン済み" }
          : { tone: "ng", text: `未ログイン（${PROVIDER_CLI[id]} でログイン）` };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`provider-card ${selected ? "selected" : ""}`}
      disabled={!status?.implemented}
      title={status?.detail}
      onClick={onSelect}
    >
      <span className="provider-card-head">
        <span className={`provider-icon provider-${id}`}>
          <ProviderIcon provider={id} size={20} />
        </span>
        <span className="provider-name">{status?.label ?? id}</span>
        {selected && <Check size={16} className="provider-check" aria-label="使用中" />}
        {status && !status.implemented && <span className="badge">{PLANNED_BADGE}</span>}
      </span>
      <span className="provider-state">
        <StatusDot tone={state.tone} />
        {state.text}
      </span>
      {ready && (status.account || status.plan) && (
        <span className="provider-account muted">{accountLine(status)}</span>
      )}
    </button>
  );
}
