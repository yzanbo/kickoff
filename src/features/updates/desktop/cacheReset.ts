// 版が変わって最初の起動で、画面の HTTP キャッシュ（userData の Cache。チャット・設定・localStorage は別の場所なので消えない）を消す。
// 古い画面のファイル（index.html・JS）が残ると、古い画面と新しいコアがかみ合わず真っ暗になるため（更新で入れた版も、install-app で入れた版も同じ）
import fs from "node:fs/promises";
import path from "node:path";
import type { BuildInfo } from "@shared/updates/types";

/** 版を見分ける鍵（手元ビルドは版が同じでもコミットが違えば別の版） */
export const buildKeyOf = (info: BuildInfo): string => `${info.version}+${info.buildNumber ?? "-"}.${info.commit ?? "-"}`;

/** 覚えておくファイル（userData の直下） */
const MARK_FILE = "last-build.txt";

/**
 * 前の起動の版と違えば clearCache を呼び、いまの版を覚える。覚えがない（初めての起動・この仕組みのない版から上げた）ときも消す。
 * 消せなくても起動は止めない（log に残す）
 */
export async function clearCacheIfBuildChanged({ userData, info, clearCache, log }: { userData: string; info: BuildInfo; clearCache(): Promise<void>; log(message: string): void }): Promise<void> {
  const file = path.join(userData, MARK_FILE);
  const current = buildKeyOf(info);
  const previous = await fs.readFile(file, "utf8").then((s) => s.trim(), () => null);
  if (previous === current) return;
  try {
    await clearCache();
    await fs.writeFile(file, `${current}\n`);
    log(`版が変わったので画面の HTTP キャッシュを消しました（${previous ?? "覚えなし"} → ${current}）`);
  } catch (e) {
    log(`画面の HTTP キャッシュを消せませんでした: ${(e as Error).message}`);
  }
}
