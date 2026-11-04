import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { errorMessage } from "@shared/errors";
import { runCommand, stderrOf } from "../system/exec.js";
import { CJK_CHAR } from "@shared/types";
import type { AudioInput, LocalOptions } from "./types.js";

/** 文字起こしを打ち切るまでの時間（長い録音でも、ふつうは数十秒で終わる） */
const TIMEOUT_MS = 10 * 60_000;

/** 受け取った音声の拡張子（ffmpeg は中身で形式を判別するが、拡張子があると確か） */
export function audioExtension(mime: string): string {
  const type = mime.split(";")[0].trim().toLowerCase();
  const known: Record<string, string> = {
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  return known[type] ?? "bin";
}

/** ffmpeg の引数: whisper.cpp が読める 16kHz・モノラル・16bit の wav にする */
export const ffmpegArgs = (input: string, output: string) => [
  "-nostdin",
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-i",
  input,
  "-ar",
  "16000",
  "-ac",
  "1",
  "-c:a",
  "pcm_s16le",
  output,
];

/** whisper-cli の引数: 時刻なし・途中経過なしで、文を outBase.txt に書く（language は "auto" なら自動で判別） */
export const whisperArgs = (opts: { model: string; wav: string; language: string; outBase: string; threads: number }) => [
  "-m",
  opts.model,
  "-f",
  opts.wav,
  "-l",
  opts.language,
  "-t",
  String(opts.threads),
  "-nt",
  "-np",
  "-otxt",
  "-of",
  opts.outBase,
];

/**
 * whisper の出力（区切りごとの行）を 1 つの文にする。日本語・中国語どうしの継ぎ目は詰め、それ以外は空白でつなぐ。
 * 無音のときに出る「[BLANK_AUDIO]」などの印は除く
 */
export function joinSegments(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.replace(/\[(BLANK_AUDIO|MUSIC|NOISE|SILENCE)\]|\((音楽|拍手|笑)\)/gi, "").trim())
    .filter(Boolean);
  return lines.reduce((acc, line) => {
    if (!acc) return line;
    const glue = CJK_CHAR.test(acc.at(-1)!) && CJK_CHAR.test(line[0]) ? "" : " ";
    return acc + glue + line;
  }, "");
}

/** ffmpeg・whisper-cli が失敗したときの文（標準エラーの最後の行を添える。長い出力の要点。なければ例外の文） */
export function commandFailure(tool: string, e: unknown): string {
  return `${tool} が失敗しました: ${stderrOf(e).split("\n").at(-1) || errorMessage(e)}`;
}

/** この Mac の whisper-cli で起こす（ffmpeg で wav にしてから。一時ファイルは必ず消す） */
export async function transcribeLocal(audio: AudioInput, opts: LocalOptions): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "kickoff-voice-"));
  try {
    const input = path.join(dir, `input.${audioExtension(audio.type)}`);
    const wav = path.join(dir, "audio.wav");
    const outBase = path.join(dir, "result");
    await fs.promises.writeFile(input, audio.bytes);
    await runCommand(opts.ffmpeg, ffmpegArgs(input, wav), { timeout: TIMEOUT_MS }).catch((e: unknown) => {
      throw new Error(commandFailure("ffmpeg", e));
    });
    const threads = Math.max(1, Math.min(8, os.availableParallelism() - 2));
    await runCommand(opts.whisper, whisperArgs({ model: opts.model, wav, language: opts.language, outBase, threads }), { timeout: TIMEOUT_MS }).catch((e: unknown) => {
      throw new Error(commandFailure("whisper-cli", e));
    });
    return joinSegments(await fs.promises.readFile(`${outBase}.txt`, "utf8"));
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}
