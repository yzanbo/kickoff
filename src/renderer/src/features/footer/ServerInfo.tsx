import type { ServerStatus } from "@shared/types";

export const serverTimeText = (t: number | string) => new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Kickoff サーバーの中身（アドレス・起動した時刻・実行中のエージェント・スマホ連携）の dt / dd。下の帯の接続の詳細と設定の「接続」で共通（.conn-list の中に置く） */
export function ServerInfoRows({ server }: { server: ServerStatus }) {
  return (
    <>
      <dt>アドレス</dt>
      <dd className="mono">
        {server.host}:{server.port}
      </dd>
      <dt>起動した時刻</dt>
      <dd>{serverTimeText(server.started_at)}</dd>
      <dt>エージェント</dt>
      <dd>実行中 {server.agents.running}</dd>
      <dt>スマホ連携</dt>
      <dd>{server.remote_enabled ? "オン（つないだスマホから使えます）" : "オフ（スマホからはつなげません）"}</dd>
    </>
  );
}
