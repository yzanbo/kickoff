// ゴミ箱の置き場のファイルの補助（移す・あるか・大きさ・小さな文字のファイルを読む）
import fs from "node:fs/promises";
import path from "node:path";

/** 移す（同じディスクなら名前の変更、別のディスクなら写してから消す） */
export { movePath as move } from "@/foundation/core/files/folderFiles";

/** 大きさを数えるときに見るファイルの数の上限（node_modules などで時間をかけすぎない） */
const MEASURE_MAX_ENTRIES = 500_000;

export const exists = (p: string) => fs.lstat(p).then(() => true, () => false);

/** フォルダの中身を足した大きさ（リンクはたどらない。数えすぎたら null） */
export async function measure(target: string): Promise<number | null> {
  let total = 0;
  let seen = 0;
  const stack = [target];
  while (stack.length > 0) {
    const p = stack.pop()!;
    const st = await fs.lstat(p).catch(() => null);
    if (!st) continue;
    if (++seen > MEASURE_MAX_ENTRIES) return null;
    // フォルダそのものの大きさ（項目の表）は数えない（中のファイルの大きさの合計にする）
    if (!st.isDirectory()) total += st.size;
    if (st.isDirectory()) for (const name of await fs.readdir(p).catch(() => [] as string[])) stack.push(path.join(p, name));
  }
  return total;
}

export const readText = (p: string) => fs.readFile(p, "utf8").then((s) => s.trim(), () => null);
