// 音声モードの読み上げ（この Mac の声 = Web Speech の speechSynthesis / OpenAI の声 = コアの /api/speech の mp3 を再生）
import type { AppSettings } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { speakableText, splitSpeech } from "./speechText";

/** 読み上げに使う設定 */
export type SpeakerSettings = Pick<AppSettings, "voice_tts_provider" | "voice_tts_voice" | "voice_tts_rate" | "voice_language">;

/** 読み上げる 1 区切り（OpenAI の声は、前の区切りを読んでいる間に次の音声を頼んでおく） */
interface Chunk {
  text: string;
  audio?: Promise<Blob>;
}

/** OpenAI の声の音声を頼む（やめて使わなくなったものの失敗は、知らせずに捨てる） */
function requestAudio(text: string): Promise<Blob> {
  const audio = api.speech(text);
  audio.catch(() => undefined);
  return audio;
}

/** この Mac の声の一覧（言語を決めていれば、その言語の声だけ） */
export function systemVoices(language: string): SpeechSynthesisVoice[] {
  const voices = typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices();
  return language === "auto" ? voices : voices.filter((v) => v.lang.toLowerCase().startsWith(language.toLowerCase()));
}

/** 使うこの Mac の声（名前で選んでいればそれ、なければ話す言語の既定の声 → その言語の最初の声 → Mac の既定） */
function pickVoice(settings: SpeakerSettings): SpeechSynthesisVoice | null {
  const all = typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices();
  const named = settings.voice_tts_voice && all.find((v) => v.name === settings.voice_tts_voice);
  if (named) return named;
  const candidates = systemVoices(settings.voice_language);
  return candidates.find((v) => v.default) ?? candidates[0] ?? all.find((v) => v.default) ?? null;
}

/**
 * 読み上げの順番待ち。enqueue で返答（Markdown）を渡すと、声に出す文だけを区切って順に読む（speechText.ts）。
 * stop で読んでいるものも待っているものもやめる。読んでいるか（speaking）が変わったら onChange、読めなかったら onError
 */
export class Speaker {
  private queue: Chunk[] = [];
  private active = false;
  /** stop のたびに進める（やめる前に始めた読み上げの続きを捨てる） */
  private generation = 0;
  private current: (() => void) | null = null;

  constructor(
    private readonly settings: () => SpeakerSettings,
    private readonly onChange: (speaking: boolean) => void,
    private readonly onError: (message: string) => void,
  ) {}

  get speaking() {
    return this.active;
  }

  /** 返答を読み上げの順番待ちに足す（声に出す文がなければ何もしない） */
  enqueue(markdown: string) {
    const chunks = splitSpeech(speakableText(markdown));
    if (chunks.length === 0) return;
    this.queue.push(...chunks.map((text) => ({ text })));
    if (!this.active) void this.run();
  }

  /** 読み上げをやめる（待っているものも捨てる） */
  stop() {
    this.generation++;
    this.queue = [];
    this.current?.();
    this.current = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.setActive(false);
  }

  private setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.onChange(active);
  }

  private async run() {
    const generation = this.generation;
    this.setActive(true);
    while (this.queue.length > 0 && generation === this.generation) {
      const chunk = this.queue.shift()!;
      const settings = this.settings();
      try {
        if (settings.voice_tts_provider === "openai") {
          chunk.audio ??= requestAudio(chunk.text);
          // 読んでいる間に次の区切りの音声を頼んでおく（区切りの間を空けない）
          const next = this.queue[0];
          if (next) next.audio ??= requestAudio(next.text);
          await this.playAudio(await chunk.audio, generation);
        } else {
          await this.playSystem(chunk.text, settings, generation);
        }
      } catch (e) {
        if (generation === this.generation) this.onError(errorMessage(e));
      }
    }
    if (generation === this.generation) this.setActive(false);
  }

  /** この Mac の声で 1 区切りを読む（読み終えた・やめたら終わる） */
  private playSystem(text: string, settings: SpeakerSettings, generation: number): Promise<void> {
    if (generation !== this.generation) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(settings);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? (settings.voice_language === "auto" ? "" : settings.voice_language);
      utterance.rate = settings.voice_tts_rate;
      utterance.onend = () => resolve();
      utterance.onerror = (e) => (e.error === "interrupted" || e.error === "canceled" ? resolve() : reject(new Error(`読み上げに失敗しました（${e.error}）`)));
      this.current = () => resolve();
      speechSynthesis.speak(utterance);
    });
  }

  /** OpenAI の声の音声を再生する（再生し終えた・やめたら終わる） */
  private async playAudio(blob: Blob, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    try {
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("読み上げの音声を再生できませんでした"));
        this.current = () => {
          audio.pause();
          resolve();
        };
        audio.play().catch(reject);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
