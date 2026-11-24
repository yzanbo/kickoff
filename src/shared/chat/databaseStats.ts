/** 性能の記録（メインプロセスの診断）に載せる DB の様子 */
export interface DatabaseStats {
  /** DB と WAL のファイルの大きさ（MB。ないときは 0） */
  dbMB: number;
  walMB: number;
  chats: number;
  events: number;
  /** 記録の多いチャット（多い順。長く続けたチャットほど、開く・描くのが重くなる） */
  busiestChats: { id: number; events: number; title: string; status: string }[];
}
