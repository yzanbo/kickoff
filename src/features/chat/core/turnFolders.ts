// 1 回の実行のフォルダ: 作業場所・ノートのフォルダ・参照資料（読めるフォルダと、読むだけで書かせないもの）
import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { isInside } from "@/foundation/core/system/paths";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { workdirOf } from "./workdir";

/** 作業場所（workdirOf）。フォルダが消えていれば（ワークツリーをアプリの外で消したときなど）分かる文で止める */
export async function resolveWorkdir(chat: Chat, project: Project): Promise<string> {
  const cwd = workdirOf(chat, project);
  const isDir = await fs.stat(cwd).then((s) => s.isDirectory(), () => false);
  if (!isDir) throw new Error(`作業場所のフォルダが見つかりません（${cwd}）。ワークツリーが消された可能性があります。新しいチャットで作業場所を選び直してください`);
  return cwd;
}

/** フォルダがなければ作って返す（作れなければ null。ノートのフォルダ） */
export function ensureDir(dir: string): string | null {
  try {
    mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

/** 作業場所の外の参照資料（読むだけ。ワークツリーのチャットからは、本体の中の資料も読むだけ） */
export function readOnlyReferences(project: Project, cwd: string): string[] {
  return project.reference_paths.map((r) => r.path).filter((p) => !isInside(cwd, p));
}

/** 参照資料を読めるようにするフォルダ（ファイルはそのフォルダ）。重複は除く */
export function referenceDirectories(project: Project): string[] {
  return [...new Set(project.reference_paths.map((r) => (r.kind === "folder" ? r.path : path.dirname(r.path))))];
}
