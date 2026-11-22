// 別ウィンドウのタブの保存の形（保存の宣言は storage.ts の popoutWindowTabs）
/** タブの列のある別ウィンドウ（ブラウザ・チャット）のタブ（ウィンドウごと。読み込み直しても同じタブを開き直す。features/popout/tabWindow.ts） */
export type PopoutWindowTab =
  | { kind: "browser"; key: string; url: string; title: string }
  | { kind: "chat"; key: string; id: number; projectId: number }
  // 送る前の新しいチャット（中身は composer の下書きの店。キーは下書きのキー）
  | { kind: "new"; key: string };
export const isPopoutWindowTab = (v: unknown): v is PopoutWindowTab => {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  if (typeof t.key !== "string") return false;
  if (t.kind === "browser") return typeof t.url === "string" && typeof t.title === "string";
  if (t.kind === "new") return true;
  return t.kind === "chat" && typeof t.id === "number" && typeof t.projectId === "number";
};
export const NO_POPOUT_WINDOW_TABS: readonly PopoutWindowTab[] = [];
