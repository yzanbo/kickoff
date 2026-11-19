import { startStallWatch, type StallRecord } from "../../core/system/stallWatch.js";
import { rotatingLog } from "../app/logFiles.js";
import { startupLog } from "../app/startupLog.js";

// メインプロセスの詰まりの記録。コアのプロセスの詰まりはコアが同じファイルに書き足し、
// RPC の stall でメインにも届く（recordCoreStall）。~/Library/Logs/<アプリ名>/stalls.jsonl に 1 行 1 件で書き（エージェントも読める場所）、
// 最近の分をプロセスごとに診断の summary.json に入れる。ファイルを回すのはメインだけ（2 つのプロセスが同じ名前で回して消し合わないように）

/** これを超えたら 1 世代だけ残して新しく書き始める（1 行 300 字ほどで、およそ 800 件） */
const STALLS_MAX_BYTES = 256 * 1024;
/** メモリに持つ最近の数（診断の summary.json に入れる） */
const RECENT_STALLS = 50;
/** これより長く止まったものは起動の記録（startup.log）にも書く（画面が応答しなくなった記録と照らし合わせるため） */
const STARTUP_LOG_STALL_MS = 2000;

const log = rotatingLog("stalls.jsonl", STALLS_MAX_BYTES);
const recent: StallRecord[] = [];
const recentCore: StallRecord[] = [];

/** 最近の分に足し、長く止まったものは起動の記録にも書く */
function remember(list: StallRecord[], record: StallRecord, who: string) {
  list.push(record);
  if (list.length > RECENT_STALLS) list.shift();
  if (record.kind === "blocked" && record.blockedMs > STARTUP_LOG_STALL_MS) {
    startupLog(`${who}が ${record.blockedMs}ms 止まりました task=${record.task ?? "-"}${record.taskMs === null ? "" : `(${record.taskMs}ms)`} cpu=${record.cpuMs}ms gc=${record.gcMs}ms`);
  }
}

/** 詰まりの見張りを始める（起動の初めに 1 回。止める関数を返す） */
export function watchMainStalls(): () => void {
  // コアのプロセスが書き足し始める前に回しておく
  log.prepare();
  return startStallWatch({
    process: "main",
    onStall: (record) => {
      log.appendJson(record);
      remember(recent, record, "メインプロセス");
    },
  });
}

/** 最近の詰まり（古い順） */
export function recentStalls(): StallRecord[] {
  return [...recent];
}

/** コアのプロセスから届いた詰まり（ファイルにはコアが書いたので、覚えるだけ） */
export function recordCoreStall(record: StallRecord) {
  remember(recentCore, record, "コアのプロセス");
}

/** コアのプロセスの最近の詰まり（古い順。作り直したコアの分も続けて） */
export function recentCoreStalls(): StallRecord[] {
  return [...recentCore];
}
