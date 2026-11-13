// macOS のゴミ箱へ移す（メモ・ファイルタブの「ゴミ箱に入れる」で共通）
import { runCommand } from "../../system/exec.js";

/** macOS のゴミ箱へ移す（/usr/bin/trash。Finder の「ゴミ箱に入れる」と同じで、元に戻せる） */
export async function moveToTrash(file: string): Promise<void> {
  await runCommand("/usr/bin/trash", [file]);
}
