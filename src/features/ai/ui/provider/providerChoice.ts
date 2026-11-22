// チャットの AI の、画面で使う純粋な決まり:
// 選べるか（対応予定は選べない）・その AI にない機能の理由・API キーで動かすか（使った分の支払い）
import { providerFeatureMissing, type ProviderFeature, type ProviderStatus } from "@shared/ai/types";
import { PROVIDER_LABELS, type ProviderId } from "@shared/settings/types";
import { PROVIDERS } from "@shared/ai/providers";

/** API キーで動かす AI に添える印（設定・チャットの AI の札） */
export const PAY_PER_USE_LABEL = "使った分の支払い";

/** AI の名前（状態がまだ届いていなくても出せるように、共有の名前から） */
export const providerLabel = (id: ProviderId, status?: ProviderStatus): string => status?.label ?? PROVIDER_LABELS[id];

/** 一覧からその AI の状態 */
export const statusOf = (statuses: readonly ProviderStatus[] | undefined, id: ProviderId): ProviderStatus | undefined => statuses?.find((s) => s.id === id);

/**
 * 新しいチャット・子チャットでその AI を選べない理由（選べるなら null）。
 * 状態がまだ届いていなければ選ばせない（届くまでは既定のまま）。対応予定（implemented でない）は理由を出す
 */
export function providerPickBlock(id: ProviderId, status: ProviderStatus | undefined): string | null {
  if (!status) return "確認中…";
  if (!status.implemented) return `${providerLabel(id, status)} は今後の対応予定です（まだ Kickoff のチャットでは使えません）`;
  if (PROVIDERS[id].apiKeyOnly && (status.auth_mode !== "api_key" || !status.has_api_key)) return `${providerLabel(id, status)} は API キーでだけ動きます（設定の「接続」で API キーを置いてください）`;
  return null;
}

/** 途中の切り替えは CLI と認証が揃っている場合だけ選べる。 */
export function providerSwitchBlock(status: ProviderStatus | undefined): string | null {
  if (!status) return "AI の状態を確認中です";
  if (!status.implemented || !status.installed) return "この AI は利用できません";
  if (status.auth_mode === "api_key" ? !status.has_api_key : !status.logged_in) return "ログインまたは API キーの設定が必要です";
  return null;
}

/**
 * そのチャットの AI でその機能を使えない理由（使えるなら null）。
 * 状態がまだ届いていないときは止めない（Claude Code のチャットで押せなくならないように）
 */
export function featureBlock(status: ProviderStatus | undefined, feature: ProviderFeature): string | null {
  if (!status) return null;
  return status.features.includes(feature) ? null : providerFeatureMissing(status.label, feature);
}

/** API キーで動かすか（使った分の支払い。設定の provider_auth が api_key） */
export const paysPerUse = (status: ProviderStatus | undefined): boolean => status?.auth_mode === "api_key";

/** AI の札に乗せたときの説明の後ろ（API キーで動かすなら、使った分の支払いであることを添える） */
export const payNote = (status: ProviderStatus | undefined): string => (paysPerUse(status) ? `。API キーで動かします（${PAY_PER_USE_LABEL}）` : "");

/**
 * AI の札とそのメニューに出す名前（表の短い名前。チャット欄の下の行は狭いので「Claude Code」を「Claude」に。乗せたときの説明は正式な名前のまま）。
 * API キーで動かすなら「· API キー」を添える
 */
export const providerChipName = (id: ProviderId, status: ProviderStatus | undefined): string => `${PROVIDERS[id].short ?? providerLabel(id, status)}${paysPerUse(status) ? " · API キー" : ""}`;
