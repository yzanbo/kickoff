import { Network } from "lucide-react";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { cx } from "@/foundation/ui/lib/cx";
import { usePopover } from "@/foundation/ui/kit/Popover";
import { OPEN_PORTS_EVENT, usePorts, usePortsDot } from "./portsStore";
import { PortsPopover } from "./PortsPopover";

/**
 * 下の帯の「ポート n」（Kickoff のプロジェクトのフォルダでポートを開いているプロセスの数。0 なら出さない）。
 * チャットの実行の間に新しく現れたものがあれば点を付ける（窓を開くと消える）。⌘K から開いたときは、0 でも窓を開いている間は出す
 */
export function PortsButton() {
  const { anchor: popoverAnchor, ...popover } = usePopover();
  const { data } = usePorts();
  const dot = usePortsDot();
  useWindowEvent(OPEN_PORTS_EVENT, () => popover.setOpen(true));
  const count = data?.length ?? 0;
  if (count === 0 && !popover.open) return null;
  const detached = data?.filter((p) => p.origin === "detached").length ?? 0;
  return (
    <>
      <button
        ref={popoverAnchor}
        type="button"
        className={cx("footer-button footer-ports", popover.open && "active")}
        aria-expanded={popover.open}
        data-tip={`プロジェクトのフォルダでポートを開いているプロセス ${count} 個${detached ? `（うち切り離されているもの ${detached} 個）` : ""}${dot ? "\nチャットの実行の間に新しく現れたものがあります" : ""}`}
        onClick={popover.toggle}
      >
        <Network size={13} aria-hidden /> ポート {count}
        {dot && <span className="footer-ports-dot" aria-label="新しく現れたものがあります" />}
      </button>
      {popover.open && <PortsPopover anchor={popoverAnchor} onClose={popover.close} />}
    </>
  );
}

/** 下の帯を隠しているときの置き場所（⌘K から開いたら、画面の左下から窓を出す） */
export function PortsFallback() {
  const { anchor: popoverAnchor, ...popover } = usePopover<HTMLSpanElement>();
  useWindowEvent(OPEN_PORTS_EVENT, () => popover.setOpen(true));
  if (!popover.open) return null;
  return (
    <>
      <span ref={popoverAnchor} className="ports-fallback-anchor" aria-hidden />
      <PortsPopover anchor={popoverAnchor} onClose={popover.close} />
    </>
  );
}
