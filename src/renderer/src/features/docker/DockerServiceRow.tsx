import { useState } from "react";
import { RotateCcw, ScrollText, SquareTerminal, TriangleAlert } from "lucide-react";
import type { DockerAction, DockerActionBody, DockerCompose, DockerContainer, DockerService, DockerSilentConflict } from "@shared/types";
import { DOCKER_MARK_LABELS } from "@shared/types";
import { useExternalBrowser } from "@/features/openWith/externalApps";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelKey } from "@/features/panel/surfaces";
import { cx } from "@/lib/cx";
import { useProjects } from "@/stores/projects";
import { api } from "@/api";
import { confirmDialog, reportFailure } from "@/ui/dialogs";
import { showToast } from "@/ui/toast";
import { Chevron } from "@/ui/Chevron";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { MARK_GLYPHS, oneoffSummary, servicePorts, serviceStatusText, shellCommand, silentText, unpublishedPorts } from "./dockerView";

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
export function DockerServiceRow({
  projectId,
  compose,
  service: s,
  busy,
  send,
  silent: silentById,
  onLogs,
}: {
  projectId: number;
  compose: DockerCompose;
  service: DockerService;
  busy: boolean;
  send: Send;
  silent: Record<string, DockerSilentConflict[]>;
  onLogs: (chips: string[]) => void;
}) {
  const menu = useContextMenu();
  const [oneoffsOpen, setOneoffsOpen] = useState(false);
  const openShell = useOpenShell(projectId, compose);
  const primary = primaryAction(s);
  const shellTarget = s.containers.find((c) => c.state === "running");
  const ports = servicePorts(s);
  const blocked = primary.action === "start" && s.containers.length === 0 && compose.start_blocked !== null ? compose.start_blocked : null;
  const run = (action: DockerAction) => send(action, { service: s.name });
  // 静かなぶつかり（このサービスのコンテナが出しているポートを、Docker の外のプロセスも待っている）
  const silent = s.containers.flatMap((c) => (silentById[c.id] ?? []).map((x) => ({ ...x, container: c.id })));
  const warnPorts = new Set(silent.map((x) => x.port));
  // 動いているのに Mac に出すはずのポートを出していない（前にポートの取り合いで起動に失敗したコンテナ）
  const unpublished = unpublishedPorts(s);

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
            <PortButton key={p} projectId={projectId} port={p} warn={warnPorts.has(p)} />
          ))}
        </span>
        <span className="docker-service-actions">
          <button type="button" className="btn btn-sm" disabled={busy || blocked !== null} title={blocked ?? undefined} onClick={() => run(primary.action)}>
            {primary.label}
          </button>
          {s.running > 0 && <IconButton icon={RotateCcw} label="再起動" disabled={busy} onClick={() => run("restart")} />}
          {s.containers.length > 0 && <IconButton icon={ScrollText} label="ログ（一覧の下に、このサービスの札で）" onClick={() => onLogs([s.name])} />}
          {shellTarget && <IconButton icon={SquareTerminal} label="シェル（下のパネルのターミナル）" onClick={() => openShell(s.name, shellTarget)} />}
        </span>
      </div>
      {unpublished.length > 0 && (
        <div className="docker-silent small">
          <TriangleAlert size={13} aria-hidden />
          <span className="docker-silent-text">
            {unpublished.map((p) => `:${p}`).join("・")} を Mac に出していません。ポートの取り合いで起動に失敗したコンテナは、あとで起動してもポートを出さないまま動きます
          </span>
          <button type="button" className="btn btn-sm" disabled={busy} data-tip={`${s.name} のコンテナを作り直して起動します（ボリュームのデータは残ります）`} onClick={() => run("recreate")}>
            作り直す
          </button>
        </div>
      )}
      {silent.map((x) => (
        <div key={`${x.container}:${x.port}:${x.pid}`} className="docker-silent small">
          <TriangleAlert size={13} aria-hidden />
          <span className="docker-silent-text">{silentText(x)}</span>
          <button type="button" className="btn btn-sm" disabled={busy} data-tip={`Docker の ${s.name} を止めます（データは残ります）`} onClick={() => send("stop_container", { container: x.container })}>
            Docker の外の {x.process} を使う
          </button>
          {x.brew_service && (
            <button type="button" className="btn btn-sm" data-tip={`Homebrew のサービス ${x.brew_service} を止めます（確かめてから）`} onClick={() => void chooseDockerSide(projectId, s.name, x.port, x.brew_service!)}>
              Docker の {s.name} を使う
            </button>
          )}
        </div>
      ))}
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
                <button type="button" className="btn btn-sm" onClick={() => onLogs([`${s.name} · 使い捨て`])}>
                  ログ
                </button>
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
          <MenuItem disabled={s.containers.length === 0} onSelect={() => onLogs([s.name])}>
            ログ
          </MenuItem>
          <MenuItem disabled={!shellTarget} onSelect={() => shellTarget && openShell(s.name, shellTarget)}>
            シェル
          </MenuItem>
        </PopupMenu>
      )}
    </div>
  );
}

/** 静かなぶつかりの［Docker の db を使う］: 確かめてから相手の Homebrew のサービスを止め、戻し方を知らせる */
async function chooseDockerSide(projectId: number, service: string, port: number, brew: string) {
  const ok = await confirmDialog({
    title: `${brew} を止めますか？`,
    message: `Homebrew のサービスです。ほかのプロジェクトも使っていることがあります。止めると localhost:${port} への接続は Docker の ${service} に届きます。戻すときは brew services start ${brew} を流します。`,
    confirmLabel: "止める",
    danger: true,
  });
  if (!ok) return;
  try {
    const { message } = await api.dockerBrewStop(projectId, brew);
    showToast(message, { label: "戻すコマンドをコピー", run: () => void navigator.clipboard.writeText(`brew services start ${brew}`) });
  } catch (e) {
    reportFailure(`${brew} を止められませんでした`)(e);
  }
}

/** Mac に出しているポート（押すとパネルのブラウザ、右クリックで外部のブラウザ・URL のコピー）。静かなぶつかりがあれば ⚠ */
function PortButton({ projectId, port, warn }: { projectId: number; port: number; warn: boolean }) {
  const menu = useContextMenu();
  const browser = useExternalBrowser();
  const url = `http://localhost:${port}`;
  return (
    <>
      <button
        type="button"
        className={cx("docker-port small", warn && "is-warn")}
        data-tip={`${url} をチャット欄のブラウザで開く`}
        onClick={() => panelActions(panelKey("side", projectId)).openBrowser(url)}
        onContextMenu={(e) => menu.open(e)}
      >
        :{port}
        {warn && " ⚠"}
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
