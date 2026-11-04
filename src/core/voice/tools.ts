import { findExecutable, searchDirs } from "../system/exec.js";

/** 文字起こしに使う外部コマンド（Homebrew の whisper-cpp と ffmpeg）の場所。なければ null */
export interface VoiceTools {
  whisper: string | null;
  ffmpeg: string | null;
}

/** whisper-cpp の実行ファイルの名前（今の名前 → 古い版の名前） */
const WHISPER_NAMES = ["whisper-cli", "whisper-cpp"];

/** この Mac の whisper-cli・ffmpeg を探す（PATH → Homebrew の場所の順） */
export async function findVoiceTools(): Promise<VoiceTools> {
  const dirs = searchDirs();
  return { whisper: findExecutable(WHISPER_NAMES, dirs), ffmpeg: findExecutable(["ffmpeg"], dirs) };
}

/** 見つからないときの案内 */
export const INSTALL_HINT = "ターミナルで brew install whisper-cpp ffmpeg を実行してから、もう一度確かめてください。";
