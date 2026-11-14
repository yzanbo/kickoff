// どのチャットも使っていない会話記録の一覧と片付け（メモの仕様書「ファイル削除」の Q17 の「いまある分」。2026-11-14 に利用者と決めた）。
// 前からある会話記録（作り直す前のチャット・前に削除したチャットのもの）は、ターミナルで直接使った Claude Code の記録と見分けられないので自動では消さず、
// 日付・大きさ・最初の発言の一覧を出して、利用者が選んだものだけを Kickoff のゴミ箱（3 日）へ入れる
import type { OrphanSession, ProviderId } from "@shared/types";
import type { Store } from "../db/store.js";
import type { AgentProvider, SessionFileInfo } from "../providers/types.js";
import type { SessionsUsedElsewhere } from "./siblingSessions.js";
import type { TrashService } from "./service.js";
import { sessionLabel } from "./sessionTrash.js";

export interface OrphanSessionDeps {
  store: Store;
  providers: Record<ProviderId, AgentProvider>;
  trashBin: Pick<TrashService, "putPath">;
  sessionsElsewhere: SessionsUsedElsewhere;
  /** 作業フォルダを含むプロジェクト（なければ null） */
  projectOfPath: (cwd: string) => number | null;
}

/** どのチャットも使っていない会話記録のファイル（Kickoff が覚えたもの = 片付けが拾うものと、ほかの Kickoff が使うものは除く） */
async function orphanFiles(deps: OrphanSessionDeps): Promise<(SessionFileInfo & { provider: ProviderId })[]> {
  const used = deps.store.events.usedSessionIds();
  const files: (SessionFileInfo & { provider: ProviderId })[] = [];
  const seen = new Set<string>();
  for (const [providerId, provider] of Object.entries(deps.providers) as [ProviderId, AgentProvider][]) {
    for (const info of (await provider.listSessionFiles?.()) ?? []) {
      // 同じファイルを 2 回数えない（いくつものプロバイダーが同じ場所を読むとき）
      if (seen.has(info.file) || used.has(info.sessionId) || deps.store.agentSessions.has(info.sessionId)) continue;
      seen.add(info.file);
      files.push({ ...info, provider: providerId });
    }
  }
  const elsewhere = deps.sessionsElsewhere(files.map((f) => f.sessionId));
  return files.filter((f) => !elsewhere.has(f.sessionId));
}

/** 一覧（新しい順） */
export async function listOrphanSessions(deps: OrphanSessionDeps): Promise<OrphanSession[]> {
  return (await orphanFiles(deps)).map((f) => ({
    session_id: f.sessionId,
    provider: f.provider,
    size: f.size,
    modified_at: f.modifiedAt,
    cwd: f.cwd,
    first_prompt: f.firstPrompt,
    project_id: f.cwd ? deps.projectOfPath(f.cwd) : null,
  }));
}

/** 選んだものをゴミ箱へ入れる（調べ直して、まだどのチャットも使っていないものだけ）。入れた数を返す */
export async function trashOrphanSessions(deps: OrphanSessionDeps, sessionIds: string[]): Promise<number> {
  const wanted = new Set(sessionIds);
  let trashed = 0;
  for (const f of await orphanFiles(deps)) {
    if (!wanted.has(f.sessionId)) continue;
    await deps.trashBin.putPath(f.file, { projectId: f.cwd ? deps.projectOfPath(f.cwd) : null, kind: "session", label: sessionLabel(f.firstPrompt) });
    trashed++;
  }
  return trashed;
}
