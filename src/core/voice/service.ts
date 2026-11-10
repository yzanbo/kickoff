import type { Store } from "../db/store.js";
import type { BusEvent, SecretSaved, VoiceStatus } from "@shared/types";
import { ModelDownloads } from "./downloads.js";
import { transcribeLocal } from "./local.js";
import { modelFile, WHISPER_MODELS } from "./models.js";
import { transcribeOpenAi } from "./openai.js";
import { synthesizeOpenAi } from "./speech.js";
import { voiceUnreadyReason } from "./readiness.js";
import { findVoiceTools, type VoiceTools } from "./tools.js";
import type { AudioInput, TranscribeEngines } from "./types.js";
import { Invalid } from "../http/errors.js";

interface VoiceServiceOptions {
  store: Store;
  /** モデルの保存先（アプリの保存先の models/） */
  modelsDir: string;
  /** モデルのダウンロードの進み具合を画面へ配る */
  publish: (event: BusEvent) => void;
  /** テストで差し替える: 文字起こしの処理・コマンドの探し方・ダウンロードの fetch */
  engines?: TranscribeEngines;
  findTools?: () => Promise<VoiceTools>;
  fetch?: typeof fetch;
}

/** 音声入力の文字起こし（設定の provider で、この Mac の whisper-cli か OpenAI に振り分ける）と、モデルの管理 */
export class VoiceService {
  private readonly store: Store;
  private readonly modelsDir: string;
  private readonly engines: TranscribeEngines;
  private readonly findTools: () => Promise<VoiceTools>;
  readonly downloads: ModelDownloads;

  constructor(opts: VoiceServiceOptions) {
    this.store = opts.store;
    this.modelsDir = opts.modelsDir;
    this.engines = opts.engines ?? { local: transcribeLocal, openai: (audio, o) => transcribeOpenAi(audio, o), speech: (text, o) => synthesizeOpenAi(text, o) };
    this.findTools = opts.findTools ?? findVoiceTools;
    this.downloads = new ModelDownloads(
      opts.modelsDir,
      (id, download) => opts.publish({ type: "voice_model", id, download, downloaded: this.downloads.isDownloaded(id) }),
      opts.fetch,
    );
  }

  private keySaved = () => Boolean(this.store.secrets.get("openai_transcribe_key"));

  /** 準備の状態（設定の「音声入力」・マイクのボタン） */
  async status(): Promise<VoiceStatus> {
    const settings = this.store.settings.get();
    const tools = await this.findTools();
    const keySaved = this.keySaved();
    const reason = voiceUnreadyReason({ settings, tools, modelDownloaded: this.downloads.isDownloaded(settings.voice_model), keySaved });
    return {
      enabled: settings.voice_enabled,
      provider: settings.voice_provider,
      ready: reason === null,
      reason,
      local: {
        ...tools,
        models: WHISPER_MODELS.map((m) => ({
          ...m,
          downloaded: this.downloads.isDownloaded(m.id),
          download: this.downloads.state(m.id),
        })),
      },
      openai: { key_saved: keySaved },
    };
  }

  /** 音声を文にする（language を省けば設定の言語。準備ができていなければ、その理由で 400。起こせなかったときも理由で 400） */
  async transcribe(audio: AudioInput, language?: string): Promise<string> {
    const settings = this.store.settings.get();
    const tools = await this.findTools();
    const key = this.store.secrets.get("openai_transcribe_key") ?? "";
    const reason = voiceUnreadyReason({ settings, tools, modelDownloaded: this.downloads.isDownloaded(settings.voice_model), keySaved: Boolean(key) });
    if (reason) throw new Invalid(reason);
    const lang = language ?? settings.voice_language;
    if (settings.voice_provider === "openai") {
      return this.engines.openai(audio, { key, baseUrl: settings.voice_openai_base_url, model: settings.voice_openai_model, language: lang });
    }
    return this.engines.local(audio, { whisper: tools.whisper!, ffmpeg: tools.ffmpeg!, model: modelFile(this.modelsDir, settings.voice_model), language: lang });
  }

  /** 音声モードの返答を OpenAI の声で読み上げた mp3（音声入力がオフ・API キーがなければ 400。この Mac の声は画面が直接使う） */
  async speak(text: string): Promise<Uint8Array> {
    const settings = this.store.settings.get();
    if (!settings.voice_enabled) throw new Invalid("音声入力がオフです。設定の「音声入力」でオンにしてください。");
    const key = this.store.secrets.get("openai_transcribe_key") ?? "";
    if (!key) throw new Invalid("OpenAI の API キーがありません。設定の「音声入力」で保存してください。");
    return this.engines.speech(text, { key, baseUrl: settings.voice_openai_base_url, voice: settings.voice_tts_openai_voice, speed: settings.voice_tts_rate });
  }

  /** OpenAI の API キーを保存する（空なら消す）。保存したかだけを返す */
  saveOpenAiKey(key: string): SecretSaved {
    this.store.secrets.set("openai_transcribe_key", key.trim());
    return { saved: this.keySaved() };
  }
}
