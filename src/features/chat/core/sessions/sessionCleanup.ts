// チャットを消したとき、そのチャットが使ったエージェントの会話記録（Claude Code のセッションのファイル）もゴミ箱へ移す。
// 消したチャットの記録に出てくるセッション（動かし始めの init・作業の終わり・いまのセッション。途中の消去・巻き戻しで増えたものも）のうち、
// 残ったチャットがどれも使っていないものだけ（分岐したチャットは元の記録を写して持つので、元のチャットのセッションも使っている）
import type { Chat } from "@shared/chat/types";
import type { ProviderId } from "@shared/settings/types";
import { errorMessage } from "@shared/foundation/errors";
import type { ChatStoreDeps } from "@/features/chat/core/stores";
import type { AgentProvider } from "@/features/ai/core/providers/types";

/** チャットが覚えている離れた AI のセッション（providerSwitch の ProviderHandoffPort.sessionsOf） */
export type RememberedSessions = (chatId: number) => { session_id: string; provider: ProviderId }[];

/** 消すチャットが使ったセッション（プロバイダーごと）と、動かした作業フォルダの候補。チャットを消す前に集める */
export interface ChatSessions {
  byProvider: Map<ProviderId, Set<string>>;
  cwds: string[];
}

export function collectChatSessions(store: Pick<ChatStoreDeps, "chats" | "events" | "db" | "projects" | "trash">, chats: Chat[], remembered: RememberedSessions = () => []): ChatSessions {
  const byProvider = new Map<ProviderId, Set<string>>();
  const cwds = new Set<string>();
  for (const chat of chats) {
    const events = store.events.sessionRecords(chat.id);
    const firstSwitch = events.find((e) => e.type === "provider_switched");
    let provider = firstSwitch?.type === "provider_switched" ? firstSwitch.data.from : chat.provider;
    const add = (id: string, owner: ProviderId) => {
      const ids = byProvider.get(owner) ?? new Set<string>();
      ids.add(id);
      byProvider.set(owner, ids);
    };
    for (const event of events) {
      if (event.type === "provider_switched") provider = event.data.to;
      else if ((event.type === "init" || event.type === "result" || event.type === "workplace_moved") && event.data.session_id) add(event.data.session_id, provider);
    }
    if (chat.session_id) add(chat.session_id, chat.provider);
    for (const session of remembered(chat.id)) add(session.session_id, session.provider);
    const project = store.projects.get(chat.project_id);
    if (chat.worktree_path) cwds.add(chat.worktree_path);
    if (project) cwds.add(project.repo_path);
  }
  return { byProvider, cwds: [...cwds] };
}

/** チャットを消したあとで、残ったチャット（とほかの Kickoff のチャット = usedElsewhere）が使っていないセッションの記録を trash で移す（失敗しても削除は止めない。移した数を返す） */
export async function discardUnusedSessions(
  store: Pick<ChatStoreDeps, "chats" | "events" | "db" | "projects" | "trash">,
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
    const discard = provider?.sessions?.discard;
    if (!discard || unused.length === 0) continue;
    try {
      moved += await discard(unused, sessions.cwds, trash);
    } catch (e) {
      console.warn(`消したチャットの会話記録をゴミ箱へ移せませんでした: ${errorMessage(e)}`);
    }
  }
  return moved;
}
