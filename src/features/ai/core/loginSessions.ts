import { errorMessage } from "@shared/foundation/errors";
import type { ProviderId } from "@shared/settings/types";
import type { Bus } from "@/foundation/core/bus";
import { Invalid } from "@/foundation/core/errors";
import type { AgentProvider, ProviderLogin } from "@/features/ai/core/providers/types";

/**
 * 進行中の AI のブラウザでのログイン。AI ごとに 1 つだけ持ち（メモリだけ）、始め直したら前のものはやめる。
 * 終わったら provider_login を知らせる（画面は AI の状態を読み直す）。CLI が自分で資格情報を書くので、Kickoff は資格情報を持たない
 */
export function createLoginSessions(providers: Record<ProviderId, AgentProvider>, bus: Bus) {
  const logins = new Map<ProviderId, ProviderLogin>();
  // 利用者がやめたログイン（終わりを「やめた」として知らせる）
  const cancelled = new WeakSet<ProviderLogin>();
  return {
    /** 始める（ブラウザで開く URL を返す。ブラウザでのログインを持たない AI は 400） */
    async start(id: ProviderId): Promise<string> {
      const provider = providers[id];
      if (!provider.login) throw new Invalid(`${provider.label} は Kickoff からブラウザでログインできません`);
      // 前のログインは覚えから外してからやめる（やめた知らせが、いまのログインの失敗として流れないように）
      const previous = logins.get(id);
      if (previous) {
        logins.delete(id);
        previous.cancel();
      }
      const login = await provider.login().catch((e: unknown) => {
        throw new Invalid(`ログインを始められませんでした: ${errorMessage(e)}`);
      });
      logins.set(id, login);
      void login.completed
        .then(
          () => bus.publish({ type: "provider_login", provider: id, status: "completed", error: null }),
          (e: unknown) => {
            // 始め直したときの前のものは知らせない（いまのログインの様子と取り違えるため）
            if (logins.get(id) !== login) return;
            const byUser = cancelled.has(login);
            bus.publish({ type: "provider_login", provider: id, status: byUser ? "cancelled" : "failed", error: byUser ? null : errorMessage(e) });
          },
        )
        .finally(() => {
          if (logins.get(id) === login) logins.delete(id);
        });
      return login.authUrl;
    },
    /** やめる（始めていなければ何もしない） */
    cancel(id: ProviderId): void {
      const login = logins.get(id);
      if (!login) return;
      cancelled.add(login);
      login.cancel();
    },
  };
}
