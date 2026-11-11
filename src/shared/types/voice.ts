// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// 音声入力（チャット欄のディクテーション）の文字起こし

/** 文字起こしの方法（local = この Mac の whisper-cli / macos = macOS の音声認識（macOS 26 以上）/ openai = OpenAI の API（互換のサーバーも可）） */
export const VOICE_PROVIDERS = ["local", "macos", "openai"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

/** 話す言語の選択肢（auto = 自動で判別。値は whisper・OpenAI に渡す ISO 639-1 の言語コード） */
export const VOICE_LANGUAGES = [
  { value: "ja", label: "日本語" },
  { value: "auto", label: "自動で判別" },
  { value: "en", label: "英語" },
  { value: "zh", label: "中国語" },
  { value: "ko", label: "韓国語" },
] as const;

/** 日本語・中国語の文字と全角の記号（起こした文をつなぐとき、この文字どうしの継ぎ目には空白を入れない） */
export const CJK_CHAR = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]|[、。・「」『』【】（）！？：；，．ー〜　]/u;

/** OpenAI の文字起こしのモデルの候補（互換のサーバーでは、ほかの名前も入れられる） */
export const OPENAI_TRANSCRIBE_MODELS = ["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"] as const;

/** 音声モードで返答を読み上げる方法（system = この Mac の声 / openai = OpenAI の声） */
export const VOICE_TTS_PROVIDERS = ["system", "openai"] as const;
export type VoiceTtsProvider = (typeof VOICE_TTS_PROVIDERS)[number];

/** OpenAI の読み上げのモデル（Base URL と API キーは文字起こしと同じものを使う） */
export const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";

/** OpenAI の読み上げの声 */
export const OPENAI_TTS_VOICES = ["coral", "alloy", "ash", "ballad", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"] as const;

/** 読み上げの速さ（1 が標準） */
export const VOICE_TTS_RATE_MIN = 0.5;
export const VOICE_TTS_RATE_MAX = 2;

/** 一度に読み上げてもらえる文の長さの上限（OpenAI の読み上げの API と同じ） */
export const SPEECH_TEXT_MAX = 4096;

/** モデルのダウンロードの進み具合（終わったら null。失敗したら error を残す） */
export interface VoiceDownload {
  received: number;
  /** 全体の大きさ（バイト。分からなければ null） */
  total: number | null;
  error?: string;
}

/** この Mac で使う whisper のモデル（ggml 形式） */
export interface VoiceModelInfo {
  id: string;
  label: string;
  /** おおよその大きさ（MB） */
  size_mb: number;
  /** 速さ・日本語の向き不向きの説明 */
  note: string;
  /** 日本語の精度の目安（1〜4） */
  accuracy: number;
  /** 速さの目安（1〜4。大きいほど速い） */
  speed: number;
  recommended: boolean;
  downloaded: boolean;
  download: VoiceDownload | null;
}

/** 音声入力の準備の状態（設定の「音声入力」とチャット欄のマイクのボタンで使う） */
export interface VoiceStatus {
  enabled: boolean;
  provider: VoiceProvider;
  /** いまの設定で文字起こしできるか */
  ready: boolean;
  /** できないときの理由（画面にそのまま出す） */
  reason: string | null;
  local: {
    /** 見つかった whisper-cli・ffmpeg の場所（なければ null） */
    whisper: string | null;
    ffmpeg: string | null;
    models: VoiceModelInfo[];
  };
  /** macOS の音声認識（話す言語の設定で確かめたもの） */
  macos: {
    /** 補助プログラムがこの Kickoff に入っているか */
    helper: boolean;
    /** この Mac で使えるか（macOS 26 以上） */
    available: boolean;
    /** 起こす言語と地域（ja-JP など。対応していなければ null） */
    locale: string | null;
    /** その言語のモデルが Mac に入っているか（なければ、はじめて使うときに macOS が落とす） */
    installed: boolean;
  };
  openai: {
    /** API キーを保存してあるか（キーそのものは返さない） */
    key_saved: boolean;
  };
}
