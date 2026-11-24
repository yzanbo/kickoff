// アプリの設定（すべての画面で 1 つ）。初めて使うときに読み、変わったらサーバーの知らせ（settings）で置き換える。
// 保存は選んだ・書き終えたらすぐ（下書きと保存のボタンは持たない）。保存は saveSettings だけが送る
import type { AppSettings } from "@shared/foundation/contract/settings";
import { request } from "@/foundation/ui/api/http";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { createStore } from "@/foundation/ui/store/createStore";
import { useStore } from "@/foundation/ui/store/useStore";

/** アプリ全体の設定（送った項目だけを変える。コアの設定のルート） */
const settingsApi = {
  settings: () => request<AppSettings>("GET", "/api/settings"),
  updateSettings: (patch: Partial<AppSettings>) => request<AppSettings>("PUT", "/api/settings", patch),
};

/** 保存したら、応答（保存したあとの設定）を set で入れる（知らせを待たずに画面をそろえる） */
export const settingsStore = createStore<AppSettings>({
  load: () => settingsApi.settings(),
  reduce: { settings: (_current, e) => e.settings },
});

/** アプリの設定（data は届くまで undefined） */
export const useAppSettings = () => useStore(settingsStore);

/**
 * アプリの設定を 1 つ以上すぐ保存する。応答を待たずに店へ入れて画面をそろえ、応答で置き換える。
 * 失敗したら設定を読み直して（入れた値を戻して）投げる（呼んだ側が欄の下に出す・お知らせにする）
 */
export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  settingsStore.update((current) => ({ ...current, ...patch }));
  try {
    settingsStore.set(await settingsApi.updateSettings(patch));
  } catch (e) {
    void settingsStore.reload().catch(() => {});
    throw e;
  }
}

/** 選んだらすぐ保存する欄の保存（待たない。失敗はお知らせ） */
export function applySettings(patch: Partial<AppSettings>, failure = "設定を保存できませんでした"): void {
  void saveSettings(patch).catch(reportFailure(failure));
}
