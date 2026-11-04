import { Check, Sparkles, SquareTerminal } from "lucide-react";
import { type ReactNode } from "react";
import { PROVIDER_IDS, type AppSettings, type Project, type ProviderId, type ProviderStatus } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useActionError } from "@/hooks/useActionError";
import { accountLine } from "@/features/usage/usage";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { ErrorText } from "@/ui/ErrorText";
import { StatusDot, type StatusTone } from "@/ui/StatusDot";
import { AiDefaults } from "./AiDefaults";

/** AI の見た目（カードのアイコンと、ログインに使う CLI） */
const PROVIDER_META: Record<ProviderId, { icon: ReactNode; cli: string }> = {
  claude: { icon: <ClaudeMark size={20} />, cli: "claude" },
  codex: { icon: <SquareTerminal size={20} />, cli: "codex" },
  gemini: { icon: <Sparkles size={20} />, cli: "gemini" },
};

/** AI: どの AI を使うか（カード）と、その AI の既定 */
export function AiSection({ project, app }: { project: Project; app: AppSettings | undefined }) {
  const providers = useAsync(api.providers);
  const { error, guard } = useActionError();
  const choose = (id: ProviderId) => guard(() => api.updateProject(project.id, { provider: id }));

  return (
    <section className="section">
      <h2>AI</h2>
      <p className="muted small">このプロジェクトのチャットで使う AI です。どれも Mac にインストールした CLI のログインをそのまま使います（API キーは不要）。</p>
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
      <ErrorText message={error} />
      {project.provider === "claude" ? (
        <AiDefaults project={project} app={app} />
      ) : (
        <p className="muted small">この AI の既定の設定は、対応したときにここで選べるようになります。</p>
      )}
    </section>
  );
}

export function ProviderCard({
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
  const meta = PROVIDER_META[id];
  const ready = status?.implemented && status.installed && status.logged_in;
  const state: { tone: StatusTone; text: string } = !status
    ? { tone: "pending", text: "確認中…" }
    : !status.implemented
      ? { tone: "na", text: status.installed ? "CLI はインストール済み" : "CLI 未インストール" }
      : !status.installed
        ? { tone: "ng", text: "CLI が見つかりません" }
        : status.logged_in
          ? { tone: "ok", text: "ログイン済み" }
          : { tone: "ng", text: `未ログイン（${meta.cli} でログイン）` };
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
        <span className={`provider-icon provider-${id}`}>{meta.icon}</span>
        <span className="provider-name">{status?.label ?? id}</span>
        {selected && <Check size={16} className="provider-check" aria-label="使用中" />}
        {status && !status.implemented && <span className="badge">対応予定</span>}
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
