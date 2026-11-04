import fs from "node:fs";
import path from "node:path";

/** 文字起こしに使う外部コマンド（Homebrew の whisper-cpp と ffmpeg）の場所。なければ null */
export interface VoiceTools {
  whisper: string | null;
  ffmpeg: string | null;
}

/** whisper-cpp の実行ファイルの名前（今の名前 → 古い版の名前） */
const WHISPER_NAMES = ["whisper-cli", "whisper-cpp"];

/** PATH に加えて探す場所（Finder から起動して PATH を取り込めなかったときのため。shellEnv.ts の補い方と同じ） */
const EXTRA_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];

/** 実行できるファイルか */
function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** names のどれかを dirs の順に探す（見つかった最初のもの） */
export function findExecutable(names: string[], dirs: string[], exists: (file: string) => boolean = isExecutable): string | null {
  for (const name of names) {
    for (const dir of dirs) {
      const file = path.join(dir, name);
      if (exists(file)) return file;
    }
  }
  return null;
}

/** 探すフォルダ（PATH → Homebrew の場所。重なりは除く） */
export const searchDirs = (pathEnv = process.env.PATH ?? "") => [...new Set([...pathEnv.split(":").filter(Boolean), ...EXTRA_DIRS])];

/** この Mac の whisper-cli・ffmpeg を探す */
export async function findVoiceTools(): Promise<VoiceTools> {
  const dirs = searchDirs();
  return { whisper: findExecutable(WHISPER_NAMES, dirs), ffmpeg: findExecutable(["ffmpeg"], dirs) };
}

/** 見つからないときの案内 */
export const INSTALL_HINT = "ターミナルで brew install whisper-cpp ffmpeg を実行してから、もう一度確かめてください。";
