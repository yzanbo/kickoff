import { useEffect, useState } from "react";
import {
  EFFORT_LABELS,
  EFFORT_LEVELS,
  PERMISSION_CHOICES,
  PERMISSION_LABELS,
  type AppSettings,
  type EffortLevel,
  type PermissionChoice,
} from "../../../core/types";
import { api, useAsync } from "../api";
import { StatusCard } from "../components/StatusCard";
import { useTheme, type Theme } from "../theme";

export function SettingsPage() {
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  const settings = useAsync(api.settings);
  const [theme, setTheme] = useTheme();
  const models = useAsync(() => api.models("claude"));
  const [draft, setDraft] = useState<AppSettings>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const currentModel = models.data?.find((m) => m.value === draft?.claudeModel);
  const dirty = draft && settings.data && JSON.stringify(draft) !== JSON.stringify(settings.data);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage(undefined);
    try {
      const saved = await api.updateSettings({
        maxConcurrentRuns: draft.maxConcurrentRuns,
        ntfyUrl: draft.ntfyUrl.trim(),
        claudeModel: draft.claudeModel,
        defaultEffort: draft.defaultEffort,
        defaultPermission: draft.defaultPermission,
        defaultFastMode: draft.defaultFastMode,
      });
      settings.setData(saved);
      setMessage({ kind: "ok", text: "保存しました" });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>設定</h1>
      </header>

      <section className="section">
        <h2>表示</h2>
        <div className="segmented theme-switch" role="radiogroup" aria-label="テーマ">
          {(["dark", "light", "system"] as Theme[]).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? "active" : ""} onClick={() => setTheme(t)}>
              {{ dark: "ダーク", light: "ライト", system: "システムに合わせる" }[t]}
            </button>
          ))}
        </div>
      </section>

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
        <p className="muted small">
          AI エージェントと GitHub は、Mac にインストールされた各 CLI のログインをそのまま使います（API キーは不要です）。
        </p>
        <div className="status-grid">
          {providers.loading && !providers.data ? (
            <StatusCard title="AI エージェント" ok={undefined} detail="確認中…" />
          ) : (
            providers.data?.map((p) => (
              <StatusCard
                key={p.id}
                title={p.label}
                ok={p.implemented ? p.loggedIn : undefined}
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
          <StatusCard
            title="GitHub CLI（gh）"
            ok={github.loading ? undefined : Boolean(github.data?.loggedIn)}
            detail={github.error ?? github.data?.detail ?? "確認中…"}
          />
        </div>
        {providers.error && <p className="error">{providers.error}</p>}
      </section>

      {draft && (
        <section className="section">
          <h2>AI の既定</h2>
          <p className="muted small">新しいチャットはこの設定から始まります。チャット欄で変えた内容は、そのチャットだけに効きます。</p>
          <div className="form">
            <label className="field">
              <span className="field-label">モデル</span>
              <select value={draft.claudeModel} onChange={(e) => setDraft({ ...draft, claudeModel: e.target.value })}>
                {!models.data?.some((m) => m.value === draft.claudeModel) && <option value={draft.claudeModel}>{draft.claudeModel}</option>}
                {models.data?.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label} — {m.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">推論の深さ（effort）</span>
              <select
                value={draft.defaultEffort ?? ""}
                onChange={(e) => setDraft({ ...draft, defaultEffort: (e.target.value || null) as EffortLevel | null })}
              >
                <option value="">セクション既定（要件定義・実装は High など）</option>
                {(currentModel?.efforts ?? EFFORT_LEVELS).map((level) => (
                  <option key={level} value={level}>
                    {EFFORT_LABELS[level]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">権限モード</span>
              <select
                value={draft.defaultPermission}
                onChange={(e) => setDraft({ ...draft, defaultPermission: e.target.value as PermissionChoice })}
              >
                {PERMISSION_CHOICES.filter((p) => p !== "auto" || !currentModel || currentModel.supportsAutoMode).map((p) => (
                  <option key={p} value={p}>
                    {PERMISSION_LABELS[p]}
                  </option>
                ))}
              </select>
              <span className="field-help">
                要件定義・スケジュールの「書き込みできるフォルダ」の制限は、どのモードでも必ず効きます。
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.defaultFastMode}
                disabled={currentModel ? !currentModel.supportsFastMode : false}
                onChange={(e) => setDraft({ ...draft, defaultFastMode: e.target.checked })}
              />
              <span>
                ファストモードを使う
                <span className="field-help">
                  応答が速くなる代わりに、Claude のプランの追加の使用枠（extra usage）から消費されます。追加の使用枠が無効な場合は通常の速度で動き、チャットに理由が表示されます。
                  {currentModel && !currentModel.supportsFastMode && "（このモデルは対応していません）"}
                </span>
              </span>
            </label>
          </div>

          <h2>エージェントの実行</h2>
          <div className="form">
            <label className="field">
              <span className="field-label">同時に実行するエージェント数</span>
              <input
                type="number"
                min={1}
                max={8}
                value={draft.maxConcurrentRuns}
                onChange={(e) => setDraft({ ...draft, maxConcurrentRuns: Number(e.target.value) })}
              />
              <span className="field-help">
                多いほど速く進みますが、プランの使用枠を早く消費します。
              </span>
            </label>
          </div>

          <h2>通知</h2>
          <div className="form">
            <label className="field">
              <span className="field-label">ntfy のトピック URL（任意）</span>
              <input
                type="url"
                value={draft.ntfyUrl}
                placeholder="https://ntfy.sh/your-topic"
                onChange={(e) => setDraft({ ...draft, ntfyUrl: e.target.value })}
              />
              <span className="field-help">承認待ち・完了・失敗をスマホに通知します（M5 で対応）。</span>
            </label>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "保存中…" : "保存"}
            </button>
            {message && <span className={message.kind === "ok" ? "success" : "error"}>{message.text}</span>}
          </div>
        </section>
      )}

      <section className="section">
        <h2>スマホ連携</h2>
        <div className="empty">LAN / Tailscale 経由のアクセスと QR ペアリングは M5 で対応します。</div>
      </section>
    </div>
  );
}
