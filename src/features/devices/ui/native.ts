// devices が window.kickoff を読む所（Mac のアプリの中だけ使える、ログイン時に起動の設定）
import type { LoginItemState } from "@shared/foundation/ipc";

/** Mac のアプリの中か（ブラウザで開いた画面では、ログイン時に起動を選べない） */
export const inDesktopApp = () => window.kickoff !== undefined;

/** ログイン時に起動の様子（Mac のアプリの外なら null） */
export const loginItemState = async (): Promise<LoginItemState | null> => (await window.kickoff?.loginItem.get()) ?? null;

/** ログイン時に起動を変える（変えたあとの様子。Mac のアプリの外なら null） */
export const setLoginItem = async (open: boolean): Promise<LoginItemState | null> => (await window.kickoff?.loginItem.set(open)) ?? null;
