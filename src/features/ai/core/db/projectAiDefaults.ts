// プロジェクトの AI ごとのチャットの既定の店（表 project_ai_defaults。書いたら project_ai_defaults で知らせる）
import type { DatabaseSync } from "node:sqlite";
import type { ProjectAiDefaults } from "@shared/ai/chatOptions";
import type { ChatOptionsPatch, ProviderId } from "@shared/settings/types";
import type { Notify } from "@/foundation/core/db/common";

export interface ProjectAiDefaultsStore {
  /** そのプロジェクトの AI ごとの既定（書いていない AI は入らない） */
  of(projectId: number): ProjectAiDefaults;
  /** その AI の既定を置き換える（空ならその AI の行を消す）。置き換えたあとの全部 */
  set(projectId: number, provider: ProviderId, options: ChatOptionsPatch): ProjectAiDefaults;
}

export function createProjectAiDefaultsStore(db: DatabaseSync, onChange: Notify): ProjectAiDefaultsStore {
  const of = (projectId: number): ProjectAiDefaults =>
    Object.fromEntries(
      db
        .prepare("SELECT provider, options FROM project_ai_defaults WHERE project_id = ? ORDER BY provider")
        .all(projectId)
        .map((r) => [String(r.provider), JSON.parse(String(r.options)) as ChatOptionsPatch]),
    );
  return {
    of,
    set(projectId, provider, options) {
      if (Object.keys(options).length === 0) db.prepare("DELETE FROM project_ai_defaults WHERE project_id = ? AND provider = ?").run(projectId, provider);
      else db.prepare("INSERT INTO project_ai_defaults (project_id, provider, options) VALUES (?, ?, ?) ON CONFLICT (project_id, provider) DO UPDATE SET options = excluded.options").run(projectId, provider, JSON.stringify(options));
      const defaults = of(projectId);
      onChange({ type: "project_ai_defaults", project_id: projectId, defaults });
      return defaults;
    },
  };
}
