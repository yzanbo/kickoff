import { useQuery } from "@/foundation/ui/query";
import type { GitBlame } from "@shared/git/types";
import { gitApi } from "./api";
import { workdirInput, type GitTarget } from "@/foundation/ui/api/workdir";

/**
 * 開いているファイルの行ごとの変更の記録（`GET /git/blame`。エディタのいまの行の右に、いつ誰が変えたかを出す GitLens と同じ形）。
 * 保存した中身（hash）・取り直した回（version）が変わるたびに読み直す。Git の外・未追跡・読めないときは null。読み直している間は同じファイルの前の値
 */
export function useGitBlame({ target, key, path, hash, version, enabled }: { target: GitTarget; key: string; path: string; hash: string | null; version: number; enabled: boolean }): GitBlame | null {
  // ファイル・作業場所（どちらも key で表す）・保存した中身・取り直した回で読み直す（取り直している間は前の値）
  const blame = useQuery(enabled && hash !== null ? ["gitBlame", key] : null, (signal) => gitApi("GET /api/projects/:projectId/git/blame", workdirInput(target, { path }), { signal }), { deps: [hash, version] });
  return enabled && !blame.error ? (blame.data ?? null) : null;
}
