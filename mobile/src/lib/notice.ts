// プッシュの通知の data（本体の core/notifications/expoPush.ts の expoPushBody）と、押したときに開く画面の道
/** 押したときに開くもの（本体の Notice の target と同じ形） */
export type NoticeTarget = { kind: "chat"; project_id: number; chat_id: number } | { kind: "ci"; project_id: number; run_id: number };

export interface NoticeTargetData {
  host_id: string;
  target: NoticeTarget;
}

/** 開く画面の道（チャットならそのチャット、CI はスマホに開いていないので本体のチャット一覧） */
export function routeOfNotice({ host_id, target }: NoticeTargetData): string {
  const host = encodeURIComponent(host_id);
  return target.kind === "chat" ? `/${host}/chat/${target.chat_id}` : `/${host}`;
}
