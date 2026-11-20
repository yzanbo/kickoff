import { useState } from "react";
import type { ProviderStatus } from "@shared/ai/types";
import { PROVIDER_AUTH_MODE_LABELS, PROVIDER_AUTH_MODES, type ProviderAuthMode } from "@shared/settings/types";
import { api } from "@/foundation/ui/api";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { providersStore } from "@/features/ai/ui/stores/providers";
import { settingsStore, useAppSettings } from "@/features/settings/ui/stores/settings";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { ResultMessage } from "@/foundation/ui/kit/SaveActions";
import { API_KEY_ONLY_PROVIDERS, PAY_PER_USE_LABEL } from "@/features/ai/ui/provider/providerChoice";
import { PLANNED_BADGE } from "./plannedProviders";

/**
 * 設定の「接続」の AI ごとのログインの仕方: サブスク（各 CLI のログイン・定額のプラン）か API キー（使った分の支払い）か。
 * API キーは Kickoff がキーチェーンの鍵で暗号化して置き、画面には二度と出さない（置いたかだけ）。Gemini（Antigravity）は API キーでだけ動く
 */
export function ProviderAuthSettings({ providers }: { providers: ProviderStatus[] }) {
  return (
    <div className="provider-auth">
      <h3>AI のログインの仕方</h3>
      <p className="muted small">サブスクは各 CLI のログイン（定額のプラン）をそのまま使います。API キーにすると、その AI のチャットは使った分だけ支払う形で動きます。</p>
      {providers.map((p) => (
        <ProviderAuthRow key={p.id} status={p} />
      ))}
    </div>
  );
}

function ProviderAuthRow({ status: p }: { status: ProviderStatus }) {
  const settings = useAppSettings().data;
  const save = useAction<"save">();
  const [key, setKey] = useState("");
  const keyOnly = API_KEY_ONLY_PROVIDERS.has(p.id);
  // API キーでだけ動く AI は、いつも API キーとして見せる（キーを置いたときに設定も API キーにする）
  const mode: ProviderAuthMode = keyOnly ? "api_key" : (p.auth_mode ?? "subscription");
  // 設定は AI ごとの一覧を丸ごと送る（ほかの AI の選択を消さない）
  const writeMode = async (next: ProviderAuthMode) => settingsStore.set(await api.updateSettings({ provider_auth: { ...(settings?.provider_auth ?? {}), [p.id]: next } }));
  const setMode = (next: ProviderAuthMode) =>
    save.run("save", async () => {
      await writeMode(next);
      await providersStore.reload();
    }, { done: "保存しました" });
  const storeKey = (value: string | null) =>
    save.run("save", async () => {
      await api.saveProviderApiKey(p.id, value);
      if (keyOnly && value && p.auth_mode !== "api_key") await writeMode("api_key");
      setKey("");
      await providersStore.reload();
    }, { done: "保存しました" });
  return (
    <div className="provider-auth-row">
      <div className="provider-auth-head">
        <strong>{p.label}</strong>
        {!p.implemented && <span className="badge">{PLANNED_BADGE}</span>}
        {mode === "api_key" && <span className="badge provider-pay-badge">{PAY_PER_USE_LABEL}</span>}
        <Segmented<ProviderAuthMode>
          label={`${p.label} のログインの仕方`}
          value={mode}
          options={PROVIDER_AUTH_MODES.map((m) => ({
            value: m,
            label: PROVIDER_AUTH_MODE_LABELS[m],
            ...(m === "subscription" && keyOnly ? { disabled: true, tip: `${p.label} はサブスクでは使いません（API キーでだけ動きます）` } : {}),
          }))}
          onChange={(m) => void setMode(m)}
        />
      </div>
      {(mode === "api_key" || keyOnly) && (
        <div className="input-row">
          <input
            type="password"
            value={key}
            autoComplete="off"
            aria-label={`${p.label} の API キー`}
            placeholder={p.has_api_key ? "保存済み（置き換えるときだけ入れる）" : "API キー"}
            onChange={(e) => setKey(e.target.value)}
          />
          <button type="button" className="btn" disabled={!key.trim() || save.busy !== null} onClick={() => void storeKey(key)}>
            {save.busy !== null ? "保存中…" : "キーを保存"}
          </button>
          {p.has_api_key && (
            <button type="button" className="btn btn-danger-text" disabled={save.busy !== null} onClick={() => void storeKey(null)}>
              消す
            </button>
          )}
        </div>
      )}
      {mode === "api_key" && !p.has_api_key && <p className="muted small">API キーを置くまで、この AI のチャットは動きません。</p>}
      <ResultMessage result={save.result} />
    </div>
  );
}
