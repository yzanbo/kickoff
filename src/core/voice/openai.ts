import { errorMessage } from "@shared/errors";
import type { AudioInput, OpenAiOptions } from "./types.js";
import { Invalid } from "../http/errors.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** 文字起こしの API の URL（Base URL が空なら OpenAI。末尾の / は除く） */
export const transcriptionUrl = (baseUrl: string) => `${(baseUrl.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "")}/audio/transcriptions`;

/** 送る multipart の中身（言語が "auto" なら送らず、サーバーに判別させる） */
export function transcriptionForm(audio: AudioInput, opts: Pick<OpenAiOptions, "model" | "language">): FormData {
  const form = new FormData();
  form.append("file", new Blob([audio.bytes as Uint8Array<ArrayBuffer>], { type: audio.type || "application/octet-stream" }), audio.name || "audio.webm");
  form.append("model", opts.model);
  form.append("response_format", "json");
  if (opts.language && opts.language !== "auto") form.append("language", opts.language);
  return form;
}

/** 成功の応答から文を取り出す（{ text }） */
export function parseTranscription(body: unknown): string {
  const text = (body as { text?: unknown } | null)?.text;
  if (typeof text !== "string") throw new Invalid("文字起こしの応答の形が正しくありません");
  return text.trim();
}

/** 失敗の応答を、画面に出す文にする（状態コードごとに案内を変える。分からなければ応答の文） */
export function openAiFailure(status: number, body: unknown): string {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  const detail = typeof message === "string" && message ? message : `HTTP ${status}`;
  if (status === 401) return `API キーが正しくありません。設定の「音声入力」で保存し直してください（${detail}）`;
  if (status === 404) return `文字起こしの API が見つかりません。Base URL とモデルを確かめてください（${detail}）`;
  if (status === 413) return "音声が大きすぎます（25MB まで）。短く区切って話してください";
  if (status === 429) return `使用枠・回数の上限に達しました。しばらくしてから試してください（${detail}）`;
  return `文字起こしに失敗しました（${detail}）`;
}

/** OpenAI（互換のサーバーも）の文字起こしの API で起こす（つながらない・断られたら、理由の文で 400） */
export async function transcribeOpenAi(audio: AudioInput, opts: OpenAiOptions, fetchImpl: typeof fetch = fetch): Promise<string> {
  const url = transcriptionUrl(opts.baseUrl);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${opts.key}` },
      body: transcriptionForm(audio, opts),
      signal: AbortSignal.timeout(5 * 60_000),
    });
  } catch (e) {
    throw new Invalid(`文字起こしの API につながりません（${new URL(url).host}）: ${errorMessage(e)}`);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Invalid(openAiFailure(res.status, body));
  return parseTranscription(body);
}
