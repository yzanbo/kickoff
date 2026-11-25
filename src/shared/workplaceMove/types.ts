// 作業場所の移動の取り決めに出る形

/** チャットの作業場所を移す（POST /api/chats/:chatId/workplace）。worktree_path: 移す先のワークツリー（本体なら null） */
export interface WorkplaceMoveBody {
  worktree_path: string | null;
  /** 新しいワークツリーへ移すときのブランチの名前（このチャットのいまの作業場所のいまのコミットから作る。あれば worktree_path は見ない） */
  new_worktree_branch?: string;
  /** コミットしていない変更も持っていく（新しいワークツリーのときだけ） */
  carry?: boolean;
}

/** 移す前の確かめの中身（GET /api/chats/:chatId/workplace） */
export interface WorkplaceMoveCheck {
  /** 元の作業場所のコミットしていない変更（プロジェクトのフォルダの中から見たパス。フォルダがなければ空） */
  changes: string[];
  /** 元の作業場所で動いている内蔵ターミナル（止めずに残す） */
  terminals: { title: string; command: string | null }[];
  /** 片付けを予約したワークツリー（移す先にできない） */
  reserved: string[];
  /** 移せない理由（共通のチャット・実行環境を整えるチャット・Git でないプロジェクト。移せれば null） */
  blocked: string | null;
  /** 元の作業場所のフォルダがない（変更の確かめは飛ばす） */
  missing: boolean;
}
