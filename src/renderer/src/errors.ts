/** 例外を画面に出す文にする（アプリ本体での処理の失敗は、Electron が付ける前置きを外す） */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e);
}
