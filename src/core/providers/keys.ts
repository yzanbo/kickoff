// AI の API キー: キーチェーンの鍵で暗号化して secrets に置く。画面・API・SSE には出さず、置いたかだけを返す
import type { ProviderAuthMode, ProviderId } from "@shared/types";
import type { Store } from "../db/store.js";
import { openSecret, sealSecret, type SecretCipher } from "../system/sealedSecret.js";

/** 1 回の実行のログインの仕方（API キーのときは、開いたキー。開けなければ null） */
export interface ProviderAuth {
  mode: ProviderAuthMode;
  apiKey: string | null;
}

export class ProviderKeyVault {
  constructor(
    private readonly store: Store,
    private readonly cipher: SecretCipher | null,
  ) {}

  /** API キーを置いたか */
  has(id: ProviderId): boolean {
    return this.store.secrets.get(`provider_api_key:${id}`) !== null;
  }

  /** API キーを置く（null・空なら消す） */
  async set(id: ProviderId, key: string | null): Promise<void> {
    const plain = key?.trim() ?? "";
    this.store.secrets.set(`provider_api_key:${id}`, plain ? await sealSecret(this.cipher, plain, "API キー") : "");
  }

  /** 設定のログインの仕方と、API キーのときは開いたキー（置いていない・開けなければ null。実行は失敗の文で止める） */
  async authFor(id: ProviderId): Promise<ProviderAuth> {
    const mode = this.store.settings.get().provider_auth[id] ?? "subscription";
    if (mode === "subscription") return { mode, apiKey: null };
    const stored = this.store.secrets.get(`provider_api_key:${id}`);
    const apiKey = stored ? await openSecret(this.cipher, stored).catch(() => null) : null;
    return { mode, apiKey };
  }
}
