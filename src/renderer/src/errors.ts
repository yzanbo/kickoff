/** 例外を画面に出す文にする */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
