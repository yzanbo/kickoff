// 設定の「音声入力」に出す、文字起こしの方法と OpenAI のモデルの説明（無料か・料金の目安）
import type { OPENAI_TRANSCRIBE_MODELS, VoiceProvider, VoiceTtsProvider } from "@shared/types";

/** 方法のカードに出すもの（名前・料金の札・ひとこと・良いところ・気を付けるところ） */
export interface ProviderInfo {
  title: string;
  price: string;
  free: boolean;
  summary: string;
  pros: string[];
  cons: string[];
}

type OpenAiTranscribeModel = (typeof OPENAI_TRANSCRIBE_MODELS)[number];

/** 文字起こしの方法のカード（名前・料金の札・良いところ・気を付けるところ） */
export const VOICE_PROVIDER_INFO: Record<VoiceProvider, ProviderInfo> = {
  local: {
    title: "この Mac（whisper）",
    price: "無料",
    free: true,
    summary: "この Mac の中で、whisper のモデルで文字にします。",
    pros: ["料金はかかりません", "音声を外に送りません", "ネットにつながっていなくても使えます", "日本語の聞き取りが正確です"],
    cons: ["はじめに準備が要ります（whisper.cpp を入れ、モデルをダウンロード）"],
  },
  macos: {
    title: "macOS の音声認識",
    price: "無料",
    free: true,
    summary: "macOS に入っている音声認識で、この Mac の中で文字にします。",
    pros: ["料金はかかりません", "音声を外に送りません", "入れるものはありません（macOS 26 以上）", "速く、Mac に負荷をかけません"],
    cons: ["「この Mac（whisper）」より、聞き取りが劣ることがあります", "言語の自動の判別はできません（Mac の言語で起こします）"],
  },
  openai: {
    title: "OpenAI",
    price: "有料（使った分だけ）",
    free: false,
    summary: "音声を OpenAI に送って文字にします。",
    pros: ["準備は API キーだけです", "Mac に負荷をかけません"],
    cons: ["話した長さに応じて API の料金がかかります（1 分あたり約 $0.003〜$0.006）", "音声を OpenAI に送ります"],
  },
};

/** 音声モードの読み上げの声のカード（OpenAI の料金は gpt-4o-mini-tts の、読み上げた音声 1 分あたりの目安） */
export const VOICE_TTS_PROVIDER_INFO: Record<VoiceTtsProvider, ProviderInfo> = {
  system: {
    title: "この Mac の声",
    price: "無料",
    free: true,
    summary: "Mac に入っている声（Kyoko など）で読み上げます。",
    pros: ["料金はかかりません", "文を外に送りません", "準備は要りません"],
    cons: ["機械らしい声です"],
  },
  openai: {
    title: "OpenAI の声",
    price: "有料（使った分だけ）",
    free: false,
    summary: "返答の文を OpenAI に送って、自然な声で読み上げます。",
    pros: ["人に近い、自然な声です"],
    cons: ["読み上げた長さに応じて API の料金がかかります（1 分あたり約 $0.015）", "API キーが要ります（文字起こしと同じキー）", "返答の文を OpenAI に送ります"],
  },
};

/** 読み上げの速さの選択肢 */
export const VOICE_TTS_RATES = [
  { value: 0.75, label: "ゆっくり（0.75 倍）" },
  { value: 1, label: "標準" },
  { value: 1.25, label: "少し速く（1.25 倍）" },
  { value: 1.5, label: "速く（1.5 倍）" },
  { value: 2, label: "とても速く（2 倍）" },
] as const;

/** OpenAI の文字起こしのモデル（料金は 1 分あたりのドル。2026 年 11 月時点の公表価格の目安） */
export const OPENAI_MODEL_INFO: Record<OpenAiTranscribeModel, { note: string; perMinute: number; recommended: boolean }> = {
  "gpt-4o-transcribe": { note: "いちばん正確です。", perMinute: 0.006, recommended: true },
  "gpt-4o-mini-transcribe": { note: "半分の料金で、ふだんの指示なら十分です。", perMinute: 0.003, recommended: false },
  "whisper-1": { note: "以前からのモデルです。", perMinute: 0.006, recommended: false },
};

/** 料金の目安の文（1 分あたりと、10 分話したとき） */
export const perMinuteText = (usd: number) => `1 分 約 $${usd.toFixed(3)}（10 分で約 $${(usd * 10).toFixed(2)}）`;

export const OPENAI_PRICE_NOTE = "料金は 2026 年 11 月時点の目安です。最新の料金は OpenAI の料金のページで確かめてください。";

/** モデルの大きさ（1000MB からは GB） */
export const formatModelSize = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`);
