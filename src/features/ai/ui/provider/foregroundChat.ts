import type { ProviderId } from "@shared/settings/types";

/** 最後に表に出したチャット。下書きも画面ごとに別の key を持つ。 */
export interface ForegroundChat {
  provider: ProviderId | null;
  key: string | null;
}

/** 同じチャットを触っただけなら参照を保ち、チャット・AI が変わったときだけ新しくする。 */
export function nextForegroundChat(current: ForegroundChat, provider: ProviderId, key: string): ForegroundChat {
  return current.provider === provider && current.key === key ? current : { provider, key };
}
