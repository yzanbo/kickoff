// AI のテストのデータ（テストからだけ使う）
import type { ProviderStatus } from "@shared/ai/types";
import { PROVIDER_LABELS, type ProviderId } from "@shared/settings/types";

/** AI の CLI の状態（名前は PROVIDER_LABELS、対応済み・入っている・ログインしている。できること capabilities は空 = 要るテストが渡す） */
export function makeProviderStatus(id: ProviderId, patch: Partial<ProviderStatus> = {}): ProviderStatus {
  return { id, label: PROVIDER_LABELS[id], implemented: true, installed: true, logged_in: true, detail: "", capabilities: [], ...patch };
}
