import { serverApi } from "@/foundation/ui/api/server";
import { errorText, useQuery } from "@/foundation/ui/query";
import { StatusCard } from "@/foundation/ui/kit/StatusCard";
import { useConnectionRecheck } from "@/features/ai/ui";
import { ServerInfoRows } from "@/features/devices/ui/footer/ServerInfo";

/** 設定の「接続」の Kickoff サーバーのカード（アドレス・起動した時刻・実行中のエージェント・スマホ連携。開くたび・「再確認」で取り直す） */
export function ServerStatusCard() {
  const server = useQuery("ConnectionSettings.server", () => serverApi("GET /api/status"));
  useConnectionRecheck(server.reload);
  return (
    <StatusCard
      title="Kickoff サーバー"
      ok={server.data ? true : server.error ? false : undefined}
      detail={
        server.data ? (
          <dl className="conn-list">
            <ServerInfoRows server={server.data} />
          </dl>
        ) : (
          (errorText(server.error) ?? "確認中…")
        )
      }
    />
  );
}
