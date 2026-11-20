// chatPanel の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const chatPanelSettings = { projectBrowserSession: storage.settings.projectBrowserSession } as const;
