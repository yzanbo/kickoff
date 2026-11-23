import { Unplug } from "lucide-react";
import { useConnectionState } from "@/foundation/ui/api/serverConnection";
import { usePopover } from "@/foundation/ui/kit/Popover";
import { cx } from "@/foundation/ui/lib/cx";
import { openSettings } from "@/features/settings/ui";
import { ConnectionPopover, connectionLabel } from "./ConnectionPopover";
import { useConnectionNotice } from "./useConnectionNotice";

/**
 * 下の帯の、サーバーとの接続が切れたときだけの札（SSE が切れると返答・状態・承認待ちが止まって見え、操作も失敗する）。
 * 押すと詳細を開き、詳細を開いている間につながったら、閉じるまで残す
 */
export function ConnectionFooterItem() {
  const connection = useConnectionState();
  const { anchor, ...conn } = usePopover();
  const notice = useConnectionNotice(connection.state);
  if (!notice && !conn.open) return null;
  return (
    <>
      <button
        ref={anchor}
        className={cx("footer-button conn", connection.state !== "open" && "conn-down", conn.open && "active")}
        title={connection.state === "open" ? "接続の詳細" : "Kickoff サーバーとの接続が切れています。返答・状態の知らせが止まり、操作も失敗します。押すと詳細を開きます"}
        aria-expanded={conn.open}
        onClick={conn.toggle}
      >
        {connection.state === "open" ? null : <Unplug size={13} aria-hidden />}
        {connectionLabel(connection.state, connection.since)}
      </button>
      {conn.open && <ConnectionPopover anchor={anchor} state={connection.state} since={connection.since} onClose={conn.close} onOpenSettings={() => openSettings("connection")} />}
    </>
  );
}
