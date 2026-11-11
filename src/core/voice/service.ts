import type { Store } from "../db/store.js";
import type { BusEvent, SecretSaved, VoiceStatus } from "@shared/types";
import { ModelDownloads } from "./downloads.js";
import { transcribeLocal } from "./local.js";
import { checkMacosSpeech, transcribeMacos, type MacosSpeech } from "./macos.js";
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
  /** macOS の音声認識の補助コマンドの場所（デスクトップアプリが渡す。なければ null） */
  speechHelper: string | null;
  /** テストで差し替える: 文字起こしの処理・コマンドの探し方・macOS の音声認識の確かめ・ダウンロードの fetch */
  engines?: TranscribeEngines;
  findTools?: () => Promise<VoiceTools>;
  checkSpeech?: (language: string) => Promise<MacosSpeech>;
  fetch?: typeof fetch;
}

/** 音声入力の文字起こし（設定の provider で、この Mac の whisper-cli・macOS の音声認識・OpenAI に振り分ける）と、モデルの管理 */
export class VoiceService {
  private readonly store: Store;
  private readonly modelsDir: string;
  private readonly engines: TranscribeEngines;
  private readonly findTools: () => Promise<VoiceTools>;
  private readonly speechHelper: string | null;
  private readonly checkSpeech: (language: string) => Promise<MacosSpeech>;
  readonly downloads: ModelDownloads;

  constructor(opts: VoiceServiceOptions) {
    this.store = opts.store;
    this.modelsDir = opts.modelsDir;
    this.engines = opts.engines ?? { local: transcribeLocal, macos: transcribeMacos, openai: (audio, o) => transcribeOpenAi(audio, o), speech: (text, o) => synthesizeOpenAi(text, o) };
    this.findTools = opts.findTools ?? findVoiceTools;
    this.speechHelper = opts.speechHelper;
    this.checkSpeech = opts.checkSpeech ?? ((language) => checkMacosSpeech(opts.speechHelper, language));
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
    const [tools, macos] = await Promise.all([this.findTools(), this.checkSpeech(settings.voice_language)]);
    const keySaved = this.keySaved();
    const reason = voiceUnreadyReason({ settings, tools, modelDownloaded: this.downloads.isDownloaded(settings.voice_model), keySaved, macos });
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
      macos,
      openai: { key_saved: keySaved },
    };
  }

  /** 音声を文にする（language を省けば設定の言語。準備ができていなければ、その理由で 400。起こせなかったときも理由で 400） */
  async transcribe(audio: AudioInput, language?: string): Promise<string> {
    const settings = this.store.settings.get();
    const lang = language ?? settings.voice_language;
    const [tools, macos] = await Promise.all([this.findTools(), this.checkSpeech(lang)]);
    const key = this.store.secrets.get("openai_transcribe_key") ?? "";
    const reason = voiceUnreadyReason({ settings, tools, modelDownloaded: this.downloads.isDownloaded(settings.voice_model), keySaved: Boolean(key), macos });
    if (reason) throw new Invalid(reason);
    if (settings.voice_provider === "macos") return this.engines.macos(audio, { helper: this.speechHelper!, language: lang });
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
