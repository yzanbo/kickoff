// Mac の通知（メインプロセスの Notification。押すとそのチャットを開く）

/** 押したときに開くチャット */
export interface NotificationTarget {
  projectId: number;
  chatId: number;
}

/** 押したときに開く CI の実行（プロジェクトの CI のタブでその実行を開く） */
export interface CiNotificationTarget {
  projectId: number;
  runId: number;
}

/** 出す通知 */
export interface NotifyRequest {
  title: string;
  body: string;
  /** 押したときに開くチャット（なければ Kickoff を前に出すだけ。テスト通知など） */
  chat?: NotificationTarget;
  /** 押したときに開く CI の実行（CI の失敗の知らせ） */
  ci?: CiNotificationTarget;
}

/** 通知を出した結果（届かなかったら理由。Mac の設定で許可していないときなど） */
export type NotifyResult = { ok: true } | { ok: false; error: string };
