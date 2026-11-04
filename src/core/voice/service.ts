import type { Store } from "../db/store.js";
import type { BusEvent, VoiceStatus } from "@shared/types";
import { ModelDownloads } from "./downloads.js";
import { transcribeLocal } from "./local.js";
import { modelFile, WHISPER_MODELS } from "./models.js";
import { transcribeOpenAi } from "./openai.js";
import { voiceUnreadyReason } from "./readiness.js";
import { findVoiceTools, type VoiceTools } from "./tools.js";
import type { AudioInput, TranscribeEngines } from "./types.js";

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
    this.engines = opts.engines ?? { local: transcribeLocal, openai: (audio, o) => transcribeOpenAi(audio, o) };
    this.findTools = opts.findTools ?? findVoiceTools;
    this.downloads = new ModelDownloads(
      opts.modelsDir,
      (id, download) => opts.publish({ type: "voice_model", id, download, downloaded: this.downloads.isDownloaded(id) }),
      opts.fetch,
    );
  }

  private keySaved = () => Boolean(this.store.getSecret("openaiTranscribeKey"));

  /** 準備の状態（設定の「音声入力」・マイクのボタン） */
  async status(): Promise<VoiceStatus> {
    const settings = this.store.getSettings();
    const tools = await this.findTools();
    const keySaved = this.keySaved();
    const reason = voiceUnreadyReason({ settings, tools, modelDownloaded: this.downloads.isDownloaded(settings.voiceModel), keySaved });
    return {
      enabled: settings.voiceEnabled,
      provider: settings.voiceProvider,
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
      openai: { keySaved },
    };
  }

  /** 音声を文にする（language を省けば設定の言語。準備ができていなければ、その理由で失敗する） */
  async transcribe(audio: AudioInput, language?: string): Promise<string> {
    const settings = this.store.getSettings();
    const tools = await this.findTools();
    const key = this.store.getSecret("openaiTranscribeKey") ?? "";
    const reason = voiceUnreadyReason({ settings, tools, modelDownloaded: this.downloads.isDownloaded(settings.voiceModel), keySaved: Boolean(key) });
    if (reason) throw new Error(reason);
    const lang = language ?? settings.voiceLanguage;
    if (settings.voiceProvider === "openai") {
      return this.engines.openai(audio, { key, baseUrl: settings.voiceOpenaiBaseUrl, model: settings.voiceOpenaiModel, language: lang });
    }
    return this.engines.local(audio, { whisper: tools.whisper!, ffmpeg: tools.ffmpeg!, model: modelFile(this.modelsDir, settings.voiceModel), language: lang });
  }

  /** OpenAI の API キーを保存する（空なら消す）。保存したかだけを返す */
  saveOpenAiKey(key: string): { saved: boolean } {
    this.store.setSecret("openaiTranscribeKey", key.trim());
    return { saved: this.keySaved() };
  }
}
