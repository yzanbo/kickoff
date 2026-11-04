import os from "node:os";
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

/** 保存先のフォルダ（~/Library/Application Support/<名前>。Electron の appData と同じ場所） */
export function appDataDir(env: AppEnv): string {
  return path.join(os.homedir(), "Library", "Application Support", APP_ENVS[env].name);
}
