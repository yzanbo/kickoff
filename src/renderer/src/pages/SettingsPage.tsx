import { useEffect, useState } from "react";
import type { AppSettings } from "../../../core/types";
import { api, useAsync } from "../api";
import { StatusCard } from "../components/StatusCard";

export function SettingsPage() {
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  const settings = useAsync(api.settings);
  const [draft, setDraft] = useState<AppSettings>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const dirty = draft && settings.data && JSON.stringify(draft) !== JSON.stringify(settings.data);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage(undefined);
    try {
      const saved = await api.updateSettings({
        maxConcurrentRuns: draft.maxConcurrentRuns,
        ntfyUrl: draft.ntfyUrl.trim(),
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
                多いほど速く進みますが、プランの使用枠を早く消費します。モデル・推論の深さ・権限モードはチャット欄で選びます。
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
