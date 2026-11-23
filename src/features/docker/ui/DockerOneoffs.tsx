// サービスの行の下の、使い捨てのコンテナ（docker compose run で作ったもの）の畳んだ一覧
import "./DockerOneoffs.css";
import { useState } from "react";
import type { DockerContainer, DockerServiceInfo } from "@shared/docker/types";
import { cx } from "@/foundation/ui/lib/cx";
import { Chevron } from "@/foundation/ui/kit/Chevron";
import { PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { DockerActionItems } from "./DockerActionItems";
import { oneoffActions, specOf, type OneoffActionId } from "./dockerActions";
import { MARK_GLYPHS, oneoffSummary } from "./dockerView";

export function DockerOneoffs({ service: s, busy, onStop, onLogs }: { service: DockerServiceInfo; busy: boolean; onStop: (container: string) => void; onLogs: () => void }) {
  const [open, setOpen] = useState(false);
  if (s.oneoffs.length === 0) return null;
  return (
    <div className="docker-oneoffs">
      <button type="button" className="docker-oneoffs-toggle small muted" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        └ {oneoffSummary(s.oneoffs)} <Chevron open={open} size={11} />
      </button>
      {open && s.oneoffs.map((c) => <OneoffRow key={c.id} c={c} busy={busy} onStop={() => onStop(c.id)} onLogs={onLogs} />)}
    </div>
  );
}

/** 使い捨てのコンテナの行（［停止］［ログ］。同じものを右クリックにも） */
function OneoffRow({ c, busy, onStop, onLogs }: { c: DockerContainer; busy: boolean; onStop: () => void; onLogs: () => void }) {
  const menu = useContextMenu();
  const running = c.state === "running";
  const specs = oneoffActions(c, busy);
  const run = (id: OneoffActionId) => (id === "stop" ? onStop() : onLogs());
  return (
    <div className="docker-oneoff small" onContextMenu={(e) => menu.open(e)}>
      <span className={cx("docker-mark", running ? "mark-running" : "mark-stopped")}>{MARK_GLYPHS[running ? "running" : "stopped"]}</span>
      <span className="docker-oneoff-name">{c.name}</span>
      <span className="muted">{c.status}</span>
      {running && (
        <button type="button" className="btn" data-size="sm" disabled={specOf(specs, "stop")?.disabled} onClick={onStop}>
          停止
        </button>
      )}
      <button type="button" className="btn" data-size="sm" onClick={onLogs}>
        ログ
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={`${c.name} の操作`} onClose={menu.close}>
          <DockerActionItems specs={specs} run={run} />
        </PopupMenu>
      )}
    </div>
  );
}
