// ワークツリーを消した・戻したことの、コアの中の知らせ（SSE には流さない）。上の機能（github・database）が WorktreesApi の onRemoved・onChanged で受ける

/** ワークツリーを消した（消えたと分かったあとに 1 回だけ。drop_db_connections は消すときの選択をそのまま載せる） */
export interface WorktreeRemoved {
  project_id: number;
  /** 作業するフォルダ（チャットの worktree_path と同じ） */
  path: string;
  branch: string | null;
  drop_db_connections: boolean;
}

export interface WorktreeEvents {
  /** 消したときに呼ぶものを足す（database がそのワークツリーの DB から作った接続を片付ける） */
  onRemoved(fn: (event: WorktreeRemoved) => void): void;
  /** 消した・戻したあとに呼ぶものを足す（github が PR の知らせを作り直す。順に待つ） */
  onChanged(fn: () => Promise<void>): void;
  removed(event: WorktreeRemoved): void;
  changed(): Promise<void>;
}

export function createWorktreeEvents(): WorktreeEvents {
  const removed: ((event: WorktreeRemoved) => void)[] = [];
  const changed: (() => Promise<void>)[] = [];
  return {
    onRemoved: (fn) => void removed.push(fn),
    onChanged: (fn) => void changed.push(fn),
    removed: (event) => {
      for (const fn of removed) fn(event);
    },
    changed: async () => {
      for (const fn of changed) await fn();
    },
  };
}
