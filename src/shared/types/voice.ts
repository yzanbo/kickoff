// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// 音声入力（チャット欄のディクテーション）の文字起こし

/** 文字起こしの方法（local = この Mac の whisper-cli / openai = OpenAI の API（互換のサーバーも可）） */
export const VOICE_PROVIDERS = ["local", "openai"] as const;
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
  openai: {
    /** API キーを保存してあるか（キーそのものは返さない） */
    key_saved: boolean;
  };
}
