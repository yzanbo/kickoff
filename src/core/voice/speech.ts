// 音声モードの読み上げ（OpenAI の読み上げの API。この Mac の声は画面が直接使うので、コアは OpenAI だけ）
import { errorMessage } from "@shared/errors";
import { OPENAI_TTS_MODEL } from "@shared/types";
import { openAiFailure, openAiUrl } from "./openai.js";
import { Invalid } from "../http/errors.js";

/** OpenAI で読み上げるときに渡す値 */
export interface SpeechOptions {
  key: string;
  /** 空なら https://api.openai.com/v1 */
  baseUrl: string;
  voice: string;
  /** 速さ（1 が標準） */
  speed: number;
}

/** 読み上げの API に送る本文（mp3 で受け取る） */
export function speechBody(text: string, opts: Pick<SpeechOptions, "voice" | "speed">) {
  return { model: OPENAI_TTS_MODEL, input: text, voice: opts.voice, speed: opts.speed, response_format: "mp3" };
}

/** OpenAI（互換のサーバーも）の読み上げの API で、文を mp3 の音声にする（つながらない・断られたら、理由の文で 400） */
export async function synthesizeOpenAi(text: string, opts: SpeechOptions, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const url = openAiUrl(opts.baseUrl, "/audio/speech");
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${opts.key}`, "content-type": "application/json" },
      body: JSON.stringify(speechBody(text, opts)),
      signal: AbortSignal.timeout(2 * 60_000),
    });
  } catch (e) {
    throw new Invalid(`読み上げの API につながりません（${new URL(url).host}）: ${errorMessage(e)}`);
  }
  if (!res.ok) throw new Invalid(openAiFailure(res.status, await res.json().catch(() => null), "読み上げ"));
  return new Uint8Array(await res.arrayBuffer());
}
