import path from "node:path";

/** この Mac で使える whisper のモデル（whisper.cpp の ggml 形式。Hugging Face の ggerganov/whisper.cpp から落とす） */
export const WHISPER_MODELS = [
  {
    id: "large-v3-turbo-q5_0",
    label: "large-v3-turbo（q5_0）",
    sizeMb: 547,
    note: "速くて、日本語も高い精度で起こせます。large-v3-turbo を軽くしたもので、ほとんどの場合これで十分です。",
    recommended: true,
  },
  {
    id: "large-v3-turbo",
    label: "large-v3-turbo",
    sizeMb: 1624,
    note: "いちばん精度が高い代わりに、大きくて少し遅くなります。メモリに余裕があるときに。",
    recommended: false,
  },
  {
    id: "small",
    label: "small",
    sizeMb: 488,
    note: "日本語はまずまずです。短い指示なら足ります。誤りが増えるので、精度を求めるなら上のモデルを。",
    recommended: false,
  },
  {
    id: "base",
    label: "base",
    sizeMb: 148,
    note: "軽くて速い代わりに、日本語の精度は低めです。英語や、試しに使うときに。",
    recommended: false,
  },
] as const;

export type WhisperModel = (typeof WHISPER_MODELS)[number];
export type WhisperModelId = WhisperModel["id"];

export const WHISPER_MODEL_IDS = WHISPER_MODELS.map((m) => m.id) as [WhisperModelId, ...WhisperModelId[]];

export const findWhisperModel = (id: string): WhisperModel | undefined => WHISPER_MODELS.find((m) => m.id === id);

const fileName = (id: string) => `ggml-${id}.bin`;

/** モデルを落とす URL */
export const modelUrl = (id: string) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${fileName(id)}`;

/** 保存先のモデルのファイル（アプリの保存先の models/。開発版と製品版で別） */
export const modelFile = (dir: string, id: string) => path.join(dir, fileName(id));
