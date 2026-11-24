// プロジェクトのテストのデータ（テストからだけ使う）
import type { Project } from "@shared/projects/types";
import { TEST_TIME } from "@shared/foundation/testing/data";

/** プロジェクト（名前は「プロジェクト<id>」、並び順は id） */
export function makeProject(id: number, patch: Partial<Project> = {}): Project {
  return {
    id,
    name: `プロジェクト${id}`,
    description: null,
    repo_path: `/repo/p${id}`,
    provider: "claude",
    reference_paths: [],
    position: id,
    pinned: false,
    archived_at: null,
    hue: 0,
    tags: [],
    note_folder: null,
    note_dir: null,
    pre_compact_prompt: null,
    post_compact_prompt: null,
    pre_compact_enabled: true,
    post_compact_enabled: true,
    github_account: null,
    github_remote: null,
    pr_watch: true,
    ci_watch: true,
    kind: null,
    created_at: TEST_TIME,
    ...patch,
  };
}
