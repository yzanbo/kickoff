// ポートを使っているプロセスの SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";

export const portEvents = {
  /**
   * ポートを使っているプロセスを調べ直した（数だけ。一覧はコマンドの全文を含むので SSE に載せず、この Mac の画面が GET /api/ports?cached=1 で読む。
   * SSE はスマホの画面にも届くため）。fresh は、チャットの実行が終わったあとに調べて新しく現れたものの数
   * （画面は下の帯の「ポート n」のボタンに点を付ける。窓を開いた・↻・止めたあとに調べたときは 0）
   */
  ports_changed: event<{ count: number; fresh: number }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof portEvents> {}
}
