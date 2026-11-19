import type { DockerEngineStarter } from "@shared/types";

/** Docker のエンジンが止まっているときの起こし方（ボタンで開くアプリ・コピーするコマンド。macOS は macosEngine.ts） */
export interface DockerEngineStarters {
  /** いまの context の名前から、画面に出す起こし方（分からなければ null） */
  starterOf: (context: string | null) => DockerEngineStarter;
  /** 起こし方が「アプリを開く」のとき、エンジンを起こす（起きるまでは待たない。画面が調べ直す） */
  start: (starter: Extract<DockerEngineStarter, { kind: "open" }>) => Promise<void>;
}
