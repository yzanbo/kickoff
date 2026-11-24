// whisper のモデルの置き場所と落とす URL（モデルの表は @shared/voice/models）
import path from "node:path";

const fileName = (id: string) => `ggml-${id}.bin`;

/** モデルを落とす URL */
export const modelUrl = (id: string) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${fileName(id)}`;

/** 保存先のモデルのファイル（アプリの保存先の models/。開発版と製品版で別） */
export const modelFile = (dir: string, id: string) => path.join(dir, fileName(id));
