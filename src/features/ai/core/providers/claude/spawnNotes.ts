// Claude Code の実行のプロセスの pid を、コアのプロセスの持ち主（メインプロセス）に知らせる（system/childProcesses.ts）。
// 起動は SDK に任せたまま（自前で起こすと、失敗の文に添える標準エラーの終わりなどを SDK が持てない）、SDK が起動したときに呼ぶ
// onProcessSpawned を使う（型には出ていない口。なくなっても知らせが届かないだけで、実行は変わらない）。終わりは実行の終わりで知らせる
import { noteAgentProcess } from "@/features/ai/core/providers/shared/process";
import { spawnedOption } from "./wire";

export function agentSpawnNotes(onSpawn?: (pid: number) => void) {
  const exits: (() => void)[] = [];
  return {
    /** query の options に重ねる */
    options: spawnedOption((pid) => {
      exits.push(noteAgentProcess(pid, onSpawn));
    }),
    /** 実行が終わった（SDK は入力を閉じたあと少し待ってから止めるが、落ちたときに残っていれば止めるのはメインの確かめ） */
    release() {
      for (const exit of exits.splice(0)) exit();
    },
  };
}
