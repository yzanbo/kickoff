// 別ウィンドウのタブの保存の形（保存の宣言は storage.ts の popoutWindowTabs。中身は種類の transfer が決める = kind.ts の TransferredTab）
/** タブの列のある別ウィンドウ（ブラウザ・チャット）のタブ（ウィンドウごと。読み込み直しても同じタブを開き直す。popout/tabWindow.ts） */
export type PopoutWindowTab = { kind: string; key: string } & Record<string, unknown>;
export const isPopoutWindowTab = (v: unknown): v is PopoutWindowTab => typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).kind === "string" && typeof (v as Record<string, unknown>).key === "string";
export const NO_POPOUT_WINDOW_TABS: readonly PopoutWindowTab[] = [];
