// 設定の「音声入力」に出す、文字起こしの方法と OpenAI のモデルの説明（無料か・料金の目安）
import type { OPENAI_TRANSCRIBE_MODELS, VoiceProvider } from "@shared/types";

type OpenAiTranscribeModel = (typeof OPENAI_TRANSCRIBE_MODELS)[number];

/** 文字起こしの方法のカード（名前・料金の札・良いところ・気を付けるところ） */
export const VOICE_PROVIDER_INFO: Record<VoiceProvider, { title: string; price: string; free: boolean; summary: string; pros: string[]; cons: string[] }> = {
  local: {
    title: "この Mac",
    price: "無料",
    free: true,
    summary: "この Mac の中で文字にします。",
    pros: ["料金はかかりません", "音声を外に送りません", "ネットにつながっていなくても使えます"],
    cons: ["はじめに準備が要ります（whisper.cpp を入れ、モデルをダウンロード）"],
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
