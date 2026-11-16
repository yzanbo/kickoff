import { startStallWatch, type StallRecord } from "../../core/system/stallWatch.js";
import { rotatingLog } from "../app/logFiles.js";
import { startupLog } from "../app/startupLog.js";

// メインプロセスの詰まりの記録（メモの仕様書「0023_表示を軽くする」の案 12）。いまはコアも同じプロセスで動くので、コアの名前もここで付く。
// ~/Library/Logs/<アプリ名>/stalls.jsonl に 1 行 1 件で書き（エージェントも読める場所）、最近の分を診断の summary.json に入れる

/** これを超えたら 1 世代だけ残して新しく書き始める（1 行 300 字ほどで、およそ 800 件） */
const STALLS_MAX_BYTES = 256 * 1024;
/** メモリに持つ最近の数（診断の summary.json に入れる） */
const RECENT_STALLS = 50;
/** これより長く止まったものは起動の記録（startup.log）にも書く（画面が応答しなくなった記録と照らし合わせるため） */
const STARTUP_LOG_STALL_MS = 2000;

const log = rotatingLog("stalls.jsonl", STALLS_MAX_BYTES);
const recent: StallRecord[] = [];

/** 詰まりの見張りを始める（起動の初めに 1 回。止める関数を返す） */
export function watchMainStalls(): () => void {
  return startStallWatch({
    process: "main",
    onStall: (record) => {
      log.appendJson(record);
      recent.push(record);
      if (recent.length > RECENT_STALLS) recent.shift();
      if (record.kind === "blocked" && record.blockedMs > STARTUP_LOG_STALL_MS) {
        startupLog(`メインプロセスが ${record.blockedMs}ms 止まりました task=${record.task ?? "-"}${record.taskMs === null ? "" : `(${record.taskMs}ms)`} cpu=${record.cpuMs}ms gc=${record.gcMs}ms`);
      }
    },
  });
}

/** 最近の詰まり（古い順） */
export function recentStalls(): StallRecord[] {
  return [...recent];
}
