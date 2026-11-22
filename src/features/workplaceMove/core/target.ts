// 移す前に見せるもの: 元の作業場所で動いている内蔵ターミナル（terminal が登録する口）と、移す先で作業中のほかのチャット
import type { ChatStoreDeps } from "@/features/chat/core/index";

/** 内蔵ターミナルの、名前とコマンド */
export interface RunningTerminal {
  title: string;
  command: string | null;
}

/** 作業場所で動いている内蔵ターミナルを聞く口（terminal が createTerminal の中で workplaceMove.api.provideRunningTerminals で登録する） */
export interface RunningTerminalsPort {
  /** dir（とその中）で動いている、そのプロジェクトか、プロジェクトのないターミナル */
  in(dir: string, projectId: number): RunningTerminal[];
}

/** 区切りと AI への文に書くターミナルの呼び名（「名前（コマンド）」） */
export const terminalLabel = (t: RunningTerminal): string => (t.command ? `${t.title}（${t.command}）` : t.title);

/** 移す先（いまあるワークツリーか本体。target が undefined = 新しいワークツリー）で作業中の、ほかのチャットの数 */
export function busyChatsIn(store: Pick<ChatStoreDeps, "chats">, isBusy: (chatId: number) => boolean, projectId: number, selfId: number, target: string | null | undefined): number {
  if (target === undefined) return 0;
  return store.chats.list({ projectId }).filter((c) => c.id !== selfId && c.worktree_path === target && isBusy(c.id)).length;
}
