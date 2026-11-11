import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { VoiceStatus } from "@shared/types";
import { runCommand } from "../system/exec.js";
import { Invalid } from "../http/errors.js";
import { audioExtension, commandFailure } from "./local.js";
import { webmToOgg } from "./webmToOgg.js";
import type { AudioInput, MacosOptions } from "./types.js";

/** macOS の音声認識の様子（画面に出す形） */
export type MacosSpeech = VoiceStatus["macos"];

/** 文字起こしを打ち切るまでの時間（はじめて使う言語は、macOS がモデルを落とすのを待つ） */
const TIMEOUT_MS = 10 * 60_000;

/** 確かめを打ち切るまでの時間（ふつうは 0.1 秒ほど） */
const CHECK_TIMEOUT_MS = 10_000;

const UNAVAILABLE: MacosSpeech = { helper: false, available: false, locale: null, installed: false };

/** 補助コマンドの check の出力を読む（読めなければ使えない扱い） */
export function parseSpeechCheck(output: string): MacosSpeech {
  try {
    const value = JSON.parse(output) as { available?: unknown; locale?: unknown; installed?: unknown };
    return { helper: true, available: value.available === true, locale: typeof value.locale === "string" ? value.locale : null, installed: value.installed === true };
  } catch {
    return { ...UNAVAILABLE, helper: true };
  }
}

/** macOS の音声認識をこの言語で使えるかを確かめる（補助コマンドがない・動かないなら使えない扱い） */
export async function checkMacosSpeech(helper: string | null, language: string): Promise<MacosSpeech> {
  if (!helper || !fs.existsSync(helper)) return UNAVAILABLE;
  return runCommand(helper, ["check", language], { timeout: CHECK_TIMEOUT_MS }).then(parseSpeechCheck, () => ({ ...UNAVAILABLE, helper: true }));
}

/** macOS の音声認識が使えないときの理由（使えるなら null） */
export function macosUnreadyReason(speech: MacosSpeech): string | null {
  if (!speech.helper) return "macOS の音声認識の補助プログラムが、この Kickoff に入っていません。ほかの方法を選んでください。";
  if (!speech.available) return "macOS の音声認識は、macOS 26 以上の対応している Mac で使えます。ほかの方法を選んでください。";
  if (!speech.locale) return "macOS の音声認識は、選んだ言語に対応していません。話す言語を変えるか、ほかの方法を選んでください。";
  return null;
}

/**
 * macOS が読める形にする。画面の録音（WebM の Opus）は macOS が読めないので、音はそのままに Ogg へ詰め替える（ffmpeg は要らない）。
 * ほかの形式（m4a・wav など）はそのまま渡す
 */
export function macosAudioFile(audio: AudioInput): { name: string; bytes: Uint8Array } {
  const ext = audioExtension(audio.type);
  if (ext !== "webm") return { name: `audio.${ext}`, bytes: audio.bytes };
  const ogg = webmToOgg(audio.bytes);
  if (!ogg) throw new Invalid("録音を読めませんでした（Opus の録音ではありません）。");
  return { name: "audio.ogg", bytes: ogg };
}

/** macOS の音声認識で起こす（一時ファイルは必ず消す）。コマンドが失敗したら 400 */
export async function transcribeMacos(audio: AudioInput, opts: MacosOptions): Promise<string> {
  const file = macosAudioFile(audio);
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "kickoff-voice-"));
  try {
    const input = path.join(dir, file.name);
    await fs.promises.writeFile(input, file.bytes);
    const text = await runCommand(opts.helper, ["transcribe", opts.language, input], { timeout: TIMEOUT_MS }).catch((e: unknown) => {
      throw new Invalid(commandFailure("macOS の音声認識", e));
    });
    return text.trim();
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}
