// Mac の通知（メインプロセスの Notification。押すとそのチャットを開く）

/** 押したときに開くチャット */
export interface NotificationTarget {
  projectId: number;
  chatId: number;
}

/** 出す通知 */
export interface NotifyRequest {
  title: string;
  body: string;
  /** 押したときに開くチャット（なければ Kickoff を前に出すだけ。テスト通知など） */
  chat?: NotificationTarget;
}

/** 通知を出した結果（届かなかったら理由。Mac の設定で許可していないときなど） */
export type NotifyResult = { ok: true } | { ok: false; error: string };
