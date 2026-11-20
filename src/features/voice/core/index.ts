// 音声入力の機能のコアの入口（ほかの機能はここだけを読む）
import path from "node:path";
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { voiceRoutes } from "./routes/voice";
import { VoiceService } from "./service";

/** OS の音声認識と、テストで差し替える文字起こしの処理・コマンドの探し方・ダウンロード */
export type VoiceEnv = Pick<ConstructorParameters<typeof VoiceService>[0], "speech" | "engines" | "findTools" | "fetch">;

/** 音声入力の文字起こし（モデルは保存先の models/ に置く。開発版と製品版で別） */
export function createVoice(k: KernelWithStore, env: VoiceEnv): CoreFeature<null> {
  const voice = new VoiceService({ store: k, modelsDir: path.join(k.paths.dataDir, "models"), publish: (e) => k.bus.publish(e), ...env });
  return { name: "voice", api: null, routes: [{ legacy: (app) => voiceRoutes(app, { voice }) }], stop: () => voice.downloads.stopAll() };
}
