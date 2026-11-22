import { OTHER_PROVIDER_IDS, PROVIDER_IDS, PROVIDER_LABELS, type ChatOptions, type ProviderId } from "@shared/settings/types";
import { useProviders } from "@/features/ai/ui/stores/providers";
import { providerPickBlock, statusOf } from "@/features/ai/ui/provider/providerChoice";
import { ProviderIcon } from "@/features/ai/ui/provider/ProviderIcon";
import { CheckField, Field } from "@/foundation/ui/kit/Field";
import { ChatDefaultsFields } from "./ChatDefaultsFields";
import { applySettings, useAppSettings } from "@/features/settings/ui";

/**
 * 設定: 新しいプロジェクトで使う AI と、AI ごとの新しいチャットの既定（モデル・推論の深さ・権限モード・ファストモード）。
 * Claude Code のほかの AI は、Kickoff のチャットで使えるもの（implemented）だけ出す。変えたらすぐ保存する
 */
export function AiDefaultsSettings() {
  const settings = useAppSettings().data;
  const statuses = useProviders().data;
  if (!settings) return null;
  const others = OTHER_PROVIDER_IDS.filter((id) => statusOf(statuses, id)?.implemented);
  /** AI の既定を変える（AI ごとの一覧を丸ごと送る） */
  const setDefaults = (provider: ProviderId, next: ChatOptions) => applySettings({ provider_chat_defaults: { ...settings.provider_chat_defaults, [provider]: next } });
  return (
    <section className="section ai-defaults-settings">
      <div className="ai-defaults-intro">
        <h2>AI の既定</h2>
        <p>新しいプロジェクトとチャットで、はじめに使う AI の設定です。</p>
        <p className="ai-defaults-scope">プロジェクトごとに設定を変えられます。チャット欄での変更は、そのチャットだけに適用されます。</p>
      </div>
      <div className="ai-defaults-project card">
        <div className="ai-defaults-project-copy">
          <h3>新しいプロジェクト</h3>
          <p>新しく作成・取り込みするプロジェクトに適用します。</p>
        </div>
        <div className="form">
        <Field
            label="新しいプロジェクトで使う AI"
            help="プロジェクトの作成後も、そのプロジェクトの設定から変更できます。"
          >
            <select value={settings.default_provider} onChange={(e) => applySettings({ default_provider: e.target.value as ProviderId })}>
              {PROVIDER_IDS.map((id) => {
                const blocked = id === settings.default_provider ? null : providerPickBlock(id, statusOf(statuses, id));
                return (
                  <option key={id} value={id} disabled={blocked !== null}>
                    {PROVIDER_LABELS[id]}
                    {blocked ? `（${blocked}）` : ""}
                  </option>
                );
              })}
            </select>
          </Field>
        </div>
      </div>
      <div className="ai-defaults-heading">
        <h3>新しいチャット</h3>
        <p>AI ごとに、チャットを始めるときの設定を決めます。</p>
      </div>
      <div className="ai-defaults-cards">
        {[...(["claude"] as const), ...others].map((id) => (
          <section key={id} className="ai-defaults-card card" aria-labelledby={`ai-defaults-${id}-title`}>
            <div className="ai-defaults-card-head">
              <span className="ai-defaults-card-icon"><ProviderIcon provider={id} size={18} /></span>
              <div><h3 id={`ai-defaults-${id}-title`}>{PROVIDER_LABELS[id]}</h3><p>{PROVIDER_LABELS[id]} のチャットに適用</p></div>
            </div>
            <div className="form ai-defaults-card-form">
              <ChatDefaultsFields provider={id} value={settings.provider_chat_defaults[id]} onChange={(next) => setDefaults(id, next)} />
            </div>
          </section>
        ))}
      </div>
      <div className="ai-defaults-heading">
        <h3>新しいチャットの制限</h3>
        <p>Claude Code・Codex の新しいチャットに適用します。既存のチャットは、ここで再びオンにしても変わりません。</p>
      </div>
      <div className="form ai-defaults-card-form">
        <CheckField
          label="コマンドのサンドボックスを使う"
          help="オフにすると、AI のコマンドが利用者の権限で作業場所の外にも書ける可能性があります。計画モードと『AI で整える』では専用の制限を維持します。macOS や AI の設定による制限は別に残ることがあります。"
          checked={settings.sandbox_enabled_by_default}
          onChange={(on) => applySettings({ sandbox_enabled_by_default: on })}
        />
        <CheckField
          label="チャットの編集先を制限する"
          help="オフにすると、Kickoff の編集先を確認する守りを外します。サンドボックスがオンなら、コマンド経由の変更にはその制限が残ります。参照資料などを守るファイル編集ツールの制限は別に残りますが、サンドボックスをオフにしたコマンドには及ばない場合があります。"
          checked={settings.edit_scope_enabled_by_default}
          onChange={(on) => applySettings({ edit_scope_enabled_by_default: on })}
        />
        <p className="muted small">オフにした制限は新しいチャットの入力欄に表示します。Auto mode などの承認の設定は別です。Claude Code・Codex 以外は、砂場オフの指定に未対応の場合、守りを外して実行せずに知らせます。</p>
      </div>
    </section>
  );
}
