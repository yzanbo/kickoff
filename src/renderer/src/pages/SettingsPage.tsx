import { useEffect, useState } from "react";
import { type AppSettings, type EffortLevel, type PermissionChoice } from "../../../core/types";
import { api, useAsync } from "../api";
import { EffortOptions, ModelOptions, PermissionOptions } from "../components/AiOptions";
import { BrowserExtensions } from "../components/BrowserExtensions";
import { ErrorText } from "../components/ErrorText";
import { Field } from "../components/Field";
import { SaveActions } from "../components/SaveActions";
import { Segmented } from "../components/Segmented";
import { GitHubStatusCard, StatusCard } from "../components/StatusCard";
import { UsagePanel } from "../components/UsagePanel";
import { useSave } from "../hooks/useSave";
import { modelDisplayName } from "../models";
import { useTheme, type Theme } from "../theme";
import type { usePlanUsage } from "../usage";

export function SettingsPage({ planUsage }: { planUsage: ReturnType<typeof usePlanUsage> }) {
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  const settings = useAsync(api.settings);
  const [theme, setTheme] = useTheme();
  const models = useAsync(() => api.models("claude"));
  const [draft, setDraft] = useState<AppSettings>();
  const save = useSave();

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const currentModel = models.data?.find((m) => m.value === draft?.claudeModel);
  const dirty = draft && settings.data && JSON.stringify(draft) !== JSON.stringify(settings.data);

  /** 設定を保存し、画面の元の値も保存した内容にする */
  const saveSettings = async (next: AppSettings) => {
    const saved = await api.updateSettings({
      maxConcurrentRuns: next.maxConcurrentRuns,
      ntfyUrl: next.ntfyUrl.trim(),
      desktopNotifications: next.desktopNotifications,
      claudeModel: next.claudeModel,
      defaultEffort: next.defaultEffort,
      defaultPermission: next.defaultPermission,
      defaultFastMode: next.defaultFastMode,
    });
    settings.setData(saved);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>設定</h1>
      </header>

      <UsagePanel planUsage={planUsage} />

      <section className="section">
        <h2>表示</h2>
        <Segmented<Theme>
          className="segmented theme-switch"
          label="テーマ"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "dark", label: "ダーク" },
            { value: "light", label: "ライト" },
            { value: "system", label: "システムに合わせる" },
          ]}
        />
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

      {draft && (
        <section className="section">
          <h2>AI の既定</h2>
          <p className="muted small">新しいチャットはこの設定から始まります。チャット欄で変えた内容は、そのチャットだけに効きます。</p>
          <div className="form">
            <Field label={`モデル（${modelDisplayName(models.data ?? [], draft.claudeModel)}）`}>
              <select value={draft.claudeModel} onChange={(e) => setDraft({ ...draft, claudeModel: e.target.value })}>
                <ModelOptions models={models.data ?? []} value={draft.claudeModel} />
              </select>
            </Field>
            <Field label="推論の深さ（effort）">
              <select
                value={draft.defaultEffort ?? ""}
                onChange={(e) => setDraft({ ...draft, defaultEffort: (e.target.value || null) as EffortLevel | null })}
              >
                <option value="">セクションに合わせる（要件定義・実装・テスト: High / スケジュール・デプロイ: Medium）</option>
                <EffortOptions model={currentModel} />
              </select>
            </Field>
            <Field label="権限モード" help="要件定義・スケジュールの「書き込みできるフォルダ」の制限は、どのモードでも必ず効きます。">
              <select
                value={draft.defaultPermission}
                onChange={(e) => setDraft({ ...draft, defaultPermission: e.target.value as PermissionChoice })}
              >
                <PermissionOptions model={currentModel} phaseLabel="セクションに合わせる（実装・テスト: 編集を自動承認 / それ以外: 毎回確認）" />
              </select>
            </Field>
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
            <Field label="同時に実行するエージェント数" help="多いほど速く進みますが、プランの使用枠を早く消費します。">
              <input
                type="number"
                min={1}
                max={8}
                value={draft.maxConcurrentRuns}
                onChange={(e) => setDraft({ ...draft, maxConcurrentRuns: Number(e.target.value) })}
              />
            </Field>
          </div>

          <h2>通知</h2>
          <div className="form">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.desktopNotifications}
                onChange={(e) => setDraft({ ...draft, desktopNotifications: e.target.checked })}
              />
              <span>
                Mac の通知で知らせる
                <span className="field-help">
                  チャットの完了・失敗・回答待ちを通知します。通知を押すと、そのチャットを開きます。Kickoff でそのチャットを見ているときは通知しません。
                </span>
              </span>
            </label>
            <Field label="ntfy のトピック URL（任意）" help="承認待ち・完了・失敗をスマホに通知します（M5 で対応）。">
              <input
                type="url"
                value={draft.ntfyUrl}
                placeholder="https://ntfy.sh/your-topic"
                onChange={(e) => setDraft({ ...draft, ntfyUrl: e.target.value })}
              />
            </Field>
          </div>

          <SaveActions save={save} disabled={!dirty} onSave={() => saveSettings(draft)} />
        </section>
      )}

      <section className="section">
        <h2>ブラウザの拡張機能</h2>
        <BrowserExtensions />
      </section>

      <section className="section">
        <h2>スマホ連携</h2>
        <div className="empty">LAN / Tailscale 経由のアクセスと QR ペアリングは M5 で対応します。</div>
      </section>
    </div>
  );
}
