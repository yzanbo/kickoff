// メモの会話（memoChat）を、メモと一緒に動かす・消す（名前の変更・移動・フォルダの移動・ゴミ箱）
import { readSetting, storedIds, writeSetting } from "@/lib/storage";
import { memoChat } from "@/lib/storageKeys";
import { isUnder, remapPath } from "./memoPaths";

/** from（メモかフォルダ）を to へ動かしたら、その中のメモの会話も付いていかせる */
export function moveMemoChats(projectId: number, from: string, to: string) {
  const head = `${projectId}:`;
  for (const id of storedIds(memoChat)) {
    if (!id.startsWith(head)) continue;
    const path = id.slice(head.length);
    if (!isUnder(path, from)) continue;
    const entries = readSetting(memoChat(id));
    writeSetting(memoChat(id), []);
    writeSetting(memoChat(`${head}${remapPath(path, from, to)}`), entries);
  }
}

/** path（メモかフォルダ）をゴミ箱に入れたら、その中のメモの会話も消す */
export function forgetMemoChats(projectId: number, path: string) {
  const head = `${projectId}:`;
  for (const id of storedIds(memoChat)) {
    if (id.startsWith(head) && isUnder(id.slice(head.length), path)) writeSetting(memoChat(id), []);
  }
}
