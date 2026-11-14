// 本体を眠らせない（powerSaveBlocker の prevent-app-suspension。画面は消えてよく、本体だけ起こしておく）。
// 決まりは keepAwakeRules.ts。作業中の数とスマホ連携のオン・オフはコアから、電源はこの Mac の powerMonitor から読む
import { powerMonitor, powerSaveBlocker } from "electron";
import type { Core } from "../../core/index.js";
import { startupLog } from "./startupLog.js";
import { keepAwakeReason, type KeepAwakeReason } from "./keepAwakeRules.js";

/** 眠らせない仕組みを始める（チャットの状態・設定・電源が変わるたびに付け外しする）。止める関数を返す */
export function startKeepAwake(core: Core): () => void {
  let blocker: number | null = null;
  let reason: KeepAwakeReason = null;
  const update = () => {
    const next = keepAwakeReason({ ...core.awakeNeeds(), onBattery: powerMonitor.isOnBatteryPower() });
    if (next === reason) return;
    reason = next;
    if (next && blocker === null) blocker = powerSaveBlocker.start("prevent-app-suspension");
    if (!next && blocker !== null) {
      powerSaveBlocker.stop(blocker);
      blocker = null;
    }
    startupLog(`眠らせない: ${next ?? "なし"}`);
  };
  const unsubscribe = core.bus.subscribe((e) => {
    if (e.type === "chat" || e.type === "settings") update();
  });
  powerMonitor.on("on-ac", update);
  powerMonitor.on("on-battery", update);
  update();
  return () => {
    unsubscribe();
    powerMonitor.off("on-ac", update);
    powerMonitor.off("on-battery", update);
    if (blocker !== null) powerSaveBlocker.stop(blocker);
    blocker = null;
  };
}
