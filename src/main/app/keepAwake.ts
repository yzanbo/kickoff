// 本体を眠らせない（powerSaveBlocker の prevent-app-suspension。画面は消えてよく、本体だけ起こしておく。MacBook のふたを閉じたときの眠りは防げない）。
// 決まりは keepAwakeRules.ts。作業中の数とスマホ連携のオン・オフはコアのプロセスの知らせ（awake。変わったときだけ届く）から、
// 電源はこの Mac の powerMonitor から読む。コアが落ちたら外し、作り直したコアの最初の知らせで付け直す
import { powerMonitor, powerSaveBlocker } from "electron";
import type { CoreState } from "@shared/ipc";
import type { AwakeNeeds } from "../../core/host/protocol.js";
import type { CoreProcess } from "./coreProcess.js";
import { startupLog } from "./startupLog.js";
import { keepAwakeReason, type KeepAwakeReason } from "./keepAwakeRules.js";

/** 眠らせない仕組みを始める（チャットの状態・設定・電源・コアの様子が変わるたびに付け外しする）。止める関数を返す */
export function startKeepAwake(core: Pick<CoreProcess, "on" | "lastAwake">, onCoreState: (fn: (state: CoreState) => void) => () => void): () => void {
  let blocker: number | null = null;
  let reason: KeepAwakeReason = null;
  /** コアから届いた最後の値（落ちている間は作業がないので null） */
  let needs: AwakeNeeds | null = core.lastAwake;
  const update = () => {
    const next = needs ? keepAwakeReason({ ...needs, onBattery: powerMonitor.isOnBatteryPower() }) : null;
    if (next === reason) return;
    reason = next;
    if (next && blocker === null) blocker = powerSaveBlocker.start("prevent-app-suspension");
    if (!next && blocker !== null) {
      powerSaveBlocker.stop(blocker);
      blocker = null;
    }
    startupLog(`眠らせない: ${next ?? "なし"}`);
  };
  const offAwake = core.on("awake", (value) => {
    needs = value;
    update();
  });
  const offState = onCoreState((state) => {
    if (state === "ready" || state === "unresponsive") return;
    needs = null;
    update();
  });
  powerMonitor.on("on-ac", update);
  powerMonitor.on("on-battery", update);
  update();
  return () => {
    offAwake();
    offState();
    powerMonitor.off("on-ac", update);
    powerMonitor.off("on-battery", update);
    if (blocker !== null) powerSaveBlocker.stop(blocker);
    blocker = null;
  };
}
