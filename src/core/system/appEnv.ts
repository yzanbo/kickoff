import path from "node:path";

/**
 * 本番（インストールしたアプリ）と開発（npm run dev / npm run daemon）で、名前・保存先・ポートを分ける。
 * 同時に動かせるように、また開発中の変更（スキーマの追加・不具合）で本番のデータを壊さないように
 */
export const APP_ENVS = {
  production: { name: "Kickoff", port: 4317 },
  development: { name: "Kickoff Dev", port: 4318 },
} as const;

export type AppEnv = keyof typeof APP_ENVS;

/** 保存先のフォルダ（親のフォルダ root は OS の口の appDataRoot = Electron の appData と同じ場所。その下の名前で分ける） */
export function appDataDir(root: string, env: AppEnv): string {
  return path.join(root, APP_ENVS[env].name);
}
