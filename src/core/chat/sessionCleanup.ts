// チャットを消したとき、そのチャットが使ったエージェントの会話記録（Claude Code のセッションのファイル）もゴミ箱へ移す（利用者と決めた）。
// 消したチャットの記録に出てくるセッション（動かし始めの init・作業の終わり・いまのセッション。途中の消去・巻き戻しで増えたものも）のうち、
// 残ったチャットがどれも使っていないものだけ（分岐したチャットは元の記録を写して持つので、元のチャットのセッションも使っている）
import type { Chat, ProviderId } from "@shared/types";
import { errorMessage } from "@shared/errors";
import type { Store } from "../db/store.js";
import type { AgentProvider } from "../providers/types.js";

/** 消すチャットが使ったセッション（プロバイダーごと）と、動かした作業フォルダの候補。チャットを消す前に集める */
export interface ChatSessions {
  byProvider: Map<ProviderId, Set<string>>;
  cwds: string[];
}

export function collectChatSessions(store: Store, chats: Chat[]): ChatSessions {
  const byProvider = new Map<ProviderId, Set<string>>();
  const cwds = new Set<string>();
  for (const chat of chats) {
    const ids = byProvider.get(chat.provider) ?? new Set<string>();
    if (chat.session_id) ids.add(chat.session_id);
    for (const id of store.events.sessionIds([chat.id])) ids.add(id);
    byProvider.set(chat.provider, ids);
    const project = store.projects.get(chat.project_id);
    if (chat.worktree_path) cwds.add(chat.worktree_path);
    if (project) cwds.add(project.repo_path);
  }
  return { byProvider, cwds: [...cwds] };
}

/** チャットを消したあとで、残ったチャット（とほかの Kickoff のチャット = usedElsewhere）が使っていないセッションの記録を trash で移す（失敗しても削除は止めない。移した数を返す） */
export async function discardUnusedSessions(
  store: Store,
  providers: Record<ProviderId, AgentProvider>,
  sessions: ChatSessions,
  trash: (path: string) => Promise<void>,
  usedElsewhere: (ids: string[]) => Set<string> = () => new Set(),
): Promise<number> {
  let moved = 0;
  for (const [providerId, ids] of sessions.byProvider) {
    const provider = providers[providerId];
    const candidates = [...ids].filter((id) => !store.events.sessionInUse(id));
    // ほかの Kickoff（製品版と開発版。同じ ~/.claude/projects に置き、開発版のデータは製品版から写す）のチャットが使っているものは残す
    const elsewhere = usedElsewhere(candidates);
    const unused = candidates.filter((id) => !elsewhere.has(id));
    if (!provider?.discardSessions || unused.length === 0) continue;
    try {
      moved += await provider.discardSessions(unused, sessions.cwds, trash);
    } catch (e) {
      console.warn(`消したチャットの会話記録をゴミ箱へ移せませんでした: ${errorMessage(e)}`);
    }
  }
  return moved;
}
