import { useState } from "react";
import { RotateCcw, SquareTerminal } from "lucide-react";
import type { DockerAction, DockerActionBody, DockerCompose, DockerContainer, DockerService } from "@shared/types";
import { DOCKER_MARK_LABELS } from "@shared/types";
import { useExternalBrowser } from "@/features/openWith/externalApps";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelKey } from "@/features/panel/surfaces";
import { cx } from "@/lib/cx";
import { useProjects } from "@/stores/projects";
import { reportFailure } from "@/ui/dialogs";
import { Chevron } from "@/ui/Chevron";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { MARK_GLYPHS, oneoffSummary, servicePorts, serviceStatusText, shellCommand } from "./dockerView";

type Send = (action: DockerActionBody["action"], extra?: Partial<DockerActionBody>) => void;

/** 行の主な操作（印で決める。動いていれば停止、一時停止なら再開、ほかは起動） */
function primaryAction(s: DockerService): { action: DockerAction; label: string } {
  if (s.mark === "paused") return { action: "unpause", label: "再開" };
  if (s.running > 0) return { action: "stop", label: "停止" };
  return { action: "start", label: "起動" };
}

/** シェルを下のパネルのターミナルのタブで開く（1 番目の動いているコンテナに入る） */
function useOpenShell(projectId: number, compose: DockerCompose) {
  const { projectsById } = useProjects();
  return (service: string, container: DockerContainer) => {
    const cwd = compose.worktree_path ?? projectsById.get(projectId)?.repo_path ?? "/";
    panelActions(panelKey("bottom", projectId)).openTerminal({ cwd, label: service, projectId, command: shellCommand(container.id), title: `シェル · ${service}` });
  };
}

/**
 * サービスの行（印・名前・イメージ・様子・Mac に出すポート・操作）。操作はいつもボタンで出し、同じものを右クリックにも入れる。
 * 札付きのサービスは動いていなければ薄く。使い捨てのコンテナは行の下に畳んで出す
 */
export function DockerServiceRow({ projectId, compose, service: s, busy, send }: { projectId: number; compose: DockerCompose; service: DockerService; busy: boolean; send: Send }) {
  const menu = useContextMenu();
  const [oneoffsOpen, setOneoffsOpen] = useState(false);
  const openShell = useOpenShell(projectId, compose);
  const primary = primaryAction(s);
  const shellTarget = s.containers.find((c) => c.state === "running");
  const ports = servicePorts(s);
  const blocked = primary.action === "start" && s.containers.length === 0 && compose.start_blocked !== null ? compose.start_blocked : null;
  const run = (action: DockerAction) => send(action, { service: s.name });

  return (
    <div className={cx("docker-service", s.profiles.length > 0 && s.running === 0 && "is-optional")}>
      <div className="docker-service-row" onContextMenu={(e) => menu.open(e)}>
        <span className={cx("docker-mark", `mark-${s.mark}`)} aria-label={DOCKER_MARK_LABELS[s.mark]} data-tip={DOCKER_MARK_LABELS[s.mark]}>
          {MARK_GLYPHS[s.mark]}
        </span>
        <span className="docker-service-name">{s.name}</span>
        <span className="docker-service-image muted small">{s.image ?? "build"}</span>
        <span className={cx("docker-service-status small", s.mark === "failed" ? "is-failed" : "muted")}>{s.mark === "running" && s.containers.length === 1 ? "" : serviceStatusText(s)}</span>
        <span className="docker-ports">
          {ports.map((p) => (
            <PortButton key={p} projectId={projectId} port={p} />
          ))}
        </span>
        <span className="docker-service-actions">
          <button type="button" className="btn btn-sm" disabled={busy || blocked !== null} title={blocked ?? undefined} onClick={() => run(primary.action)}>
            {primary.label}
          </button>
          {s.running > 0 && <IconButton icon={RotateCcw} label="再起動" disabled={busy} onClick={() => run("restart")} />}
          {shellTarget && <IconButton icon={SquareTerminal} label="シェル（下のパネルのターミナル）" onClick={() => openShell(s.name, shellTarget)} />}
        </span>
      </div>
      {s.oneoffs.length > 0 && (
        <div className="docker-oneoffs">
          <button type="button" className="docker-oneoffs-toggle small muted" aria-expanded={oneoffsOpen} onClick={() => setOneoffsOpen((o) => !o)}>
            └ {oneoffSummary(s.oneoffs)} <Chevron open={oneoffsOpen} size={11} />
          </button>
          {oneoffsOpen &&
            s.oneoffs.map((c) => (
              <div key={c.id} className="docker-oneoff small">
                <span className={cx("docker-mark", c.state === "running" ? "mark-running" : "mark-stopped")}>{c.state === "running" ? "●" : "○"}</span>
                <span className="docker-oneoff-name">{c.name}</span>
                <span className="muted">{c.status}</span>
                {c.state === "running" && (
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => send("stop_container", { container: c.id })}>
                    停止
                  </button>
                )}
              </div>
            ))}
        </div>
      )}
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={`${s.name} の操作`} onClose={menu.close}>
          {s.mark === "paused" && (
            <MenuItem disabled={busy} onSelect={() => run("unpause")}>
              再開
            </MenuItem>
          )}
          <MenuItem disabled={busy || blocked !== null || (s.running > 0 && s.running === s.containers.length)} title={blocked ?? undefined} onSelect={() => run("start")}>
            起動
          </MenuItem>
          <MenuItem disabled={busy || s.running === 0} onSelect={() => run("stop")}>
            停止
          </MenuItem>
          <MenuItem disabled={busy || s.running === 0} onSelect={() => run("restart")}>
            再起動
          </MenuItem>
          <div className="menu-separator" role="separator" />
          <MenuItem disabled={!shellTarget} onSelect={() => shellTarget && openShell(s.name, shellTarget)}>
            シェル
          </MenuItem>
        </PopupMenu>
      )}
    </div>
  );
}

/** Mac に出しているポート（押すとパネルのブラウザ、右クリックで外部のブラウザ・URL のコピー） */
function PortButton({ projectId, port }: { projectId: number; port: number }) {
  const menu = useContextMenu();
  const browser = useExternalBrowser();
  const url = `http://localhost:${port}`;
  return (
    <>
      <button
        type="button"
        className="docker-port small"
        data-tip={`${url} をチャット欄のブラウザで開く`}
        onClick={() => panelActions(panelKey("side", projectId)).openBrowser(url)}
        onContextMenu={(e) => menu.open(e)}
      >
        :{port}
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={`:${port}`} onClose={menu.close}>
          <MenuItem onSelect={() => browser.open(url)}>外部のブラウザで開く（{browser.label}）</MenuItem>
          <MenuItem onSelect={() => void navigator.clipboard.writeText(url).catch(reportFailure("コピーできませんでした"))}>URL をコピー</MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
