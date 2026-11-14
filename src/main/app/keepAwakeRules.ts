// 本体を眠らせないかの決まり（Electron に依らないのでテストできる。付け外しは keepAwake.ts）

/** 眠らせない理由（null なら眠ってよい） */
export type KeepAwakeReason = "working" | "mobile" | null;

/**
 * 作業中のチャットがあれば眠らせない（作業が止まらないように）。スマホ連携がオンで電源につないでいる間も眠らせない
 * （スマホから新しい指示を送るには、待っている間も本体が起きている必要がある。バッテリーのときは眠ってよい）。2026-11-14 に決めた
 */
export function keepAwakeReason({ running, mobileEnabled, onBattery }: { running: number; mobileEnabled: boolean; onBattery: boolean }): KeepAwakeReason {
  if (running > 0) return "working";
  if (mobileEnabled && !onBattery) return "mobile";
  return null;
}
