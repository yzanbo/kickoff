// Electron の IPC の取り決め（チャンネルの一覧と、引数・戻り値・知らせの形）。型と値（種類・定数）だけで、zod・Electron・Node に依存しない
export * from "./contract";
export * from "./browserExtensions";
export * from "./diagnostics";
export * from "./externalApps";
export * from "./notifications";
export * from "./terminal";
