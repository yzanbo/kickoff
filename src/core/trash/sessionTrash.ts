// Kickoff が作ったセッション（Claude Code の会話記録）のうち、どのチャットからも使われなくなったものを Kickoff のゴミ箱（3 日）へ入れる
// （メモの仕様書「ファイル削除」の Q17。2026-11-14 に利用者と決めた）。チャットの削除・巻き戻しなどで使われなくなった記録の漏れを拾う。
// 前からある会話記録（覚えていないもの）は、ターミナルで直接使った Claude Code の記録と見分けられないので触らない（利用者が選ぶ一覧 orphanSessions.ts から片付ける）
import type { ProviderId } from "@shared/types";
import type { Store } from "../db/store.js";
import type { AgentProvider } from "../providers/types.js";
import type { SessionsUsedElsewhere } from "./siblingSessions.js";
import type { TrashService } from "./service.js";

/** 覚えてからこれだけたったものだけを見る（作ったばかりで、まだチャット・記録に書いていないものを片付けないように） */
export const SESSION_SWEEP_GRACE_MS = 60 * 60 * 1000;

export interface SessionSweepDeps {
  store: Store;
  providers: Record<ProviderId, AgentProvider>;
  trashBin: Pick<TrashService, "putPath">;
  /** ほかの Kickoff（製品版と開発版）が使っているセッション（それは片付けず、覚えからだけ外す） */
  sessionsElsewhere: SessionsUsedElsewhere;
  now?: () => number;
}

/** 会話記録と同じ名前のフォルダ（Claude Code がサブエージェントの記録などを置く。記録と一緒にゴミ箱へ入れる） */
export const sessionCompanion = (file: string): string => file.replace(/\.jsonl$/, "");

/** ゴミ箱の一覧に出す名前（最初の発言があれば添える） */
export function sessionLabel(firstPrompt: string | null): string {
  if (!firstPrompt) return "会話記録";
  const line = firstPrompt.split("\n")[0];
  return `会話記録「${line.length > 40 ? `${line.slice(0, 40)}…` : line}」`;
}

/** 使われなくなったセッションの会話記録をゴミ箱へ入れて忘れる。入れた数を返す */
export async function sweepUnusedSessions(deps: SessionSweepDeps): Promise<number> {
  const { store } = deps;
  const before = new Date((deps.now?.() ?? Date.now()) - SESSION_SWEEP_GRACE_MS).toISOString();
  const candidates = store.agentSessions.olderThan(before);
  if (candidates.length === 0) return 0;
  const used = store.events.usedSessionIds();
  const unused = candidates.filter((row) => !used.has(row.session_id));
  const elsewhere = deps.sessionsElsewhere(unused.map((row) => row.session_id));
  let trashed = 0;
  for (const row of unused) {
    if (elsewhere.has(row.session_id)) {
      store.agentSessions.forget(row.session_id);
      continue;
    }
    const provider = deps.providers[row.provider];
    if (!provider?.sessionInfo) continue;
    const info = await provider.sessionInfo(row.session_id, [row.cwd]);
    if (info) {
      await deps.trashBin.putPath(info.file, { projectId: row.project_id, kind: "session", label: sessionLabel(info.firstPrompt), companions: [sessionCompanion(info.file)] });
      trashed++;
    }
    store.agentSessions.forget(row.session_id);
  }
  return trashed;
}
