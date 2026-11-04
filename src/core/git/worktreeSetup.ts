import fs from "node:fs/promises";
import path from "node:path";
import { execFileAsync } from "../system/exec.js";

/** 新しいワークツリーへ、本体から写すフォルダ（Git で無視していて、作り直すのに時間がかかるもの） */
const CARRY_DIRS = ["node_modules"];

/**
 * 作ったばかりのワークツリーを、すぐ作業できるようにする: 本体の node_modules などを APFS の複製（cp -c。中身を共有するので容量はほぼ増えない）で写す。
 * 本物のフォルダとして写すので、ワークツリーで npm install しても本体は変わらず、リンク先をたどらない道具（Vite の配信の制限など）でも困らない。
 * Git で無視していないもの・ワークツリーにすでにあるもの・本体にないものは写さない。写せなくても（APFS でないなど）ワークツリーの作成は失敗させない
 */
export async function prepareWorktree(repo: string, target: string): Promise<string[]> {
  const carried: string[] = [];
  for (const dir of CARRY_DIRS) {
    const from = path.join(repo, dir);
    const to = path.join(target, dir);
    if (!(await fs.stat(from).catch(() => null))?.isDirectory()) continue;
    if (await fs.stat(to).catch(() => null)) continue;
    const ignored = await execFileAsync("git", ["-C", repo, "check-ignore", "-q", dir]).then(
      () => true,
      () => false,
    );
    if (!ignored) continue;
    try {
      await execFileAsync("cp", ["-c", "-R", from, to], { timeout: 120_000 });
      carried.push(dir);
    } catch (e) {
      console.warn(`[worktree] ${dir} を写せませんでした`, e);
      await fs.rm(to, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  return carried;
}
