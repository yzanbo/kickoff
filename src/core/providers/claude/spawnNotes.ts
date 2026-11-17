// Claude Code の実行のプロセスの pid を、コアのプロセスの持ち主（メインプロセス）に知らせる（system/childProcesses.ts）。
// 起動は SDK に任せたまま（自前で起こすと、失敗の文に添える標準エラーの終わりなどを SDK が持てない）、SDK が起動したときに呼ぶ
// onProcessSpawned を使う（型には出ていない口。なくなっても知らせが届かないだけで、実行は変わらない）。終わりは実行の終わりで知らせる
import { reportChildProcess } from "../../system/childProcesses.js";

export function agentSpawnNotes(onSpawn?: (pid: number) => void) {
  const pids: number[] = [];
  return {
    /** query の options に重ねる */
    options: {
      onProcessSpawned: (pid: number) => {
        pids.push(pid);
        reportChildProcess({ pid, group: false, kind: "agent", state: "started" });
        onSpawn?.(pid);
      },
    },
    /** 実行が終わった（SDK は入力を閉じたあと少し待ってから止めるが、落ちたときに残っていれば止めるのはメインの確かめ） */
    release() {
      for (const pid of pids.splice(0)) reportChildProcess({ pid, group: false, kind: "agent", state: "exited" });
    },
  };
}
