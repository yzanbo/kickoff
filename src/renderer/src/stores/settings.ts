// アプリの設定（すべての画面で 1 つ）。初めて使うときに読み、変わったらサーバーの知らせ（settings）で置き換える
import type { AppSettings } from "@shared/types";
import { api } from "@/api";
import { createStore } from "./createStore";
import { useStore } from "./useStore";

/** 保存したら、応答（保存したあとの設定）を set で入れる（知らせを待たずに画面をそろえる） */
export const settingsStore = createStore<AppSettings>({
  load: () => api.settings(),
  reduce: (current, e) => (e.type === "settings" ? e.settings : current),
});

/** アプリの設定（data は届くまで undefined） */
export const useAppSettings = () => useStore(settingsStore);
