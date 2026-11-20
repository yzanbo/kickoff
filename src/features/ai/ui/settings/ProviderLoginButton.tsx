import { useState } from "react";
import { LogIn } from "lucide-react";
import type { ProviderStatus } from "@shared/ai/types";
import { errorMessage } from "@shared/foundation/errors";
import { api } from "@/foundation/ui/api";
import { useServerEvent } from "@/foundation/ui/api/events";
import { providersStore } from "@/features/ai/ui/stores/providers";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";

type LoginState = { kind: "idle" } | { kind: "starting" } | { kind: "waiting" } | { kind: "failed"; message: string };

/** 設定の「接続」で、ブラウザでログインできる AI（features の login）がログインしていなければ出すか */
export const canBrowserLogin = (p: ProviderStatus) => p.implemented && p.installed && !p.logged_in && p.features.includes("login");

/**
 * AI のブラウザでのログイン（いまは Codex = ChatGPT でログイン）。押すとコアがログインを始め、返った URL を既定のブラウザで開く
 * （メインプロセスが window.open を既定のブラウザに渡す）。ログインの戻り先は CLI が受け、資格情報も CLI の置き場に書く（Kickoff は持たない）。
 * 終わりは SSE の provider_login で受け、AI の状態を読み直す
 */
export function ProviderLoginButton({ provider }: { provider: ProviderStatus }) {
  const [state, setState] = useState<LoginState>({ kind: "idle" });

  useServerEvent("provider_login", (e) => {
    if (e.provider !== provider.id) return;
    if (e.status === "completed") void providersStore.reload();
    setState(e.status === "failed" ? { kind: "failed", message: e.error ?? "ログインできませんでした" } : { kind: "idle" });
  });

  const start = async () => {
    setState({ kind: "starting" });
    try {
      const { auth_url } = await api.startProviderLogin(provider.id);
      window.open(auth_url, "_blank", "noopener");
      setState({ kind: "waiting" });
    } catch (e) {
      setState({ kind: "failed", message: errorMessage(e) });
    }
  };

  if (state.kind === "waiting") {
    return (
      <div className="provider-login">
        <p className="muted small">ブラウザでログインしてください。終わると、ここに反映されます。</p>
        <button className="btn" onClick={() => void api.cancelProviderLogin(provider.id)}>
          やめる
        </button>
      </div>
    );
  }
  return (
    <div className="provider-login">
      <button className="btn" disabled={state.kind === "starting"} onClick={() => void start()}>
        <LogIn size={14} aria-hidden />
        {state.kind === "starting" ? "開いています…" : "ブラウザでログイン"}
      </button>
      {state.kind === "failed" && <ErrorText message={state.message} />}
    </div>
  );
}
