import { useEffect, useState } from "react";
import type { GitBlame } from "@shared/types";
import { api, type GitTarget } from "@/api";

/**
 * 開いているファイルの行ごとの変更の記録（`GET /git/blame`。エディタのいまの行の右に、いつ誰が変えたかを出す GitLens と同じ形）。
 * 保存した中身（hash）・取り直した回（version）が変わるたびに読み直す。Git の外・未追跡・読めないときは null。読み直している間は同じファイルの前の値
 */
export function useGitBlame({ target, key, path, hash, version, enabled }: { target: GitTarget; key: string; path: string; hash: string | null; version: number; enabled: boolean }): GitBlame | null {
  const [state, setState] = useState<{ key: string; blame: GitBlame | null }>();
  useEffect(() => {
    if (!enabled || hash === null) return;
    let alive = true;
    api.gitBlame(target, path).then(
      (blame) => alive && setState({ key, blame }),
      () => alive && setState({ key, blame: null }),
    );
    return () => {
      alive = false;
    };
    // ファイル・作業場所・保存した中身・取り直した回で読み直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hash, version, enabled]);
  return enabled && state?.key === key ? state.blame : null;
}
