import "./DockerServiceRow.css";
import { Database, RotateCcw, ScrollText, SquareTerminal, TriangleAlert } from "lucide-react";
import type { DockerAction, DockerActionBody, DockerCompose, DockerContainer, DockerPortConflict, DockerServiceInfo, DockerSilentConflict } from "@shared/docker/types";
import { DOCKER_MARK_LABELS } from "@shared/docker/types";
import { openTab, panelKey, terminalTab } from "@/features/panel/ui";
import { cx } from "@/foundation/ui/lib/cx";
import { useProjects } from "@/features/projects/ui";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { DockerActionItems } from "./DockerActionItems";
import { dbBlockedOf, primaryAction, serviceActions, shellTargetOf, specOf, type ServiceActionId } from "./dockerActions";
import { DockerOneoffs } from "./DockerOneoffs";
import { PortButton, SilentConflictRow } from "./DockerPorts";
import { useOpenDockerDb } from "./useOpenDockerDb";
import { MARK_GLYPHS, conflictText, servicePorts, serviceStatusText, shellCommand, unpublishedPorts } from "./dockerView";

type Send = (action: DockerActionBody["action"], extra?: Partial<DockerActionBody>) => void;

/** シェルを下のパネルのターミナルのタブで開く（1 番目の動いているコンテナに入る） */
function useOpenShell(projectId: number, compose: DockerCompose) {
  const { projectsById } = useProjects();
  return (service: string, container: DockerContainer) => {
    const cwd = compose.worktree_path ?? projectsById.get(projectId)?.repo_path ?? "/";
    openTab(panelKey("bottom", projectId), terminalTab({ cwd, label: service, projectId, command: shellCommand(container.id), title: `シェル · ${service}` }));
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
  conflicts,
  stopOthers,
}: {
  projectId: number;
  compose: DockerCompose;
  service: DockerServiceInfo;
  busy: boolean;
  send: Send;
  silent: Record<string, DockerSilentConflict[]>;
  onLogs: (chips: string[]) => void;
  /** このサービスがポートでぶつかった相手（最後の失敗） */
  conflicts: DockerPortConflict[];
  /** ［相手を止めて起動］（ぶつかった最初の行だけ。押すと相手をまとめて止める） */
  stopOthers: { label: string; tip: string } | null;
}) {
  const menu = useContextMenu();
  const openShell = useOpenShell(projectId, compose);
  const primary = primaryAction(s);
  const shellTarget = shellTargetOf(s);
  const ports = servicePorts(s);
  const run = (action: DockerAction) => send(action, { service: s.name });
  // 静かなぶつかり（このサービスのコンテナが出しているポートを、Docker の外のプロセスも待っている）
  const silent = s.containers.flatMap((c) => (silentById[c.id] ?? []).map((x) => ({ ...x, container: c.id })));
  const warnPorts = new Set(silent.map((x) => x.port));
  // 動いているのに Mac に出すはずのポートを出していない（前にポートの取り合いで起動に失敗したコンテナ）
  const unpublished = unpublishedPorts(s);
  // DB のサービスの「DB で開く」（Mac にポートを出していなければ押せない。動いていなければ確かめて起動してから）
  const db = useOpenDockerDb(projectId, compose, s, () => run("start"));
  const dbBlocked = dbBlockedOf(s, db.waiting);
  // 押せる条件と理由は操作の表（ボタンもメニューもここを読む）
  const specs = serviceActions(s, compose, { busy, dbWaiting: db.waiting });
  const spec = (id: ServiceActionId) => specOf(specs, id);
  const perform = (id: ServiceActionId) => {
    if (id === "logs") onLogs([s.name]);
    else if (id === "shell") shellTarget && openShell(s.name, shellTarget);
    else if (id === "db") db.request();
    else run(id);
  };

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
            <PortButton key={p} projectId={projectId} port={p} warn={warnPorts.has(p)} onOpenDb={s.db_kind && !dbBlocked ? db.request : null} />
          ))}
        </span>
        <span className="docker-service-actions">
          <button type="button" className="btn" data-size="sm" disabled={spec(primary.id)?.disabled} title={spec(primary.id)?.title} onClick={() => perform(primary.id)}>
            {primary.label}
          </button>
          {s.running > 0 && <IconButton icon={RotateCcw} label="再起動" disabled={spec("restart")?.disabled} onClick={() => perform("restart")} />}
          <IconButton icon={ScrollText} label="ログ（一覧の下に、このサービスの札で）" title={s.containers.length ? undefined : "ログ（まだ起動していません。起動したら流れ始めます）"} onClick={() => perform("logs")} />
          {shellTarget && <IconButton icon={SquareTerminal} label="シェル（下のパネルのターミナル）" onClick={() => perform("shell")} />}
          {s.db_kind && (
            <IconButton icon={Database} label="DB で開く" title={spec("db")?.title ?? "DB で開く（DB タブの DB クライアント）"} disabled={spec("db")?.disabled} onClick={() => perform("db")} />
          )}
        </span>
      </div>
      {conflicts.length > 0 && (
        <div className="docker-conflict small" role="alert">
          <TriangleAlert size={13} aria-hidden />
          <span className="docker-conflict-text">
            {conflicts.map((c) => (
              <span key={`${c.container_id}:${c.port}`}>{conflictText(c)}</span>
            ))}
          </span>
          {stopOthers && (
            <button type="button" className="btn" data-size="sm" disabled={busy} data-tip={stopOthers.tip} onClick={() => send("stop_others_and_start")}>
              {stopOthers.label}
            </button>
          )}
        </div>
      )}
      {unpublished.length > 0 && (
        <div className="docker-silent small">
          <TriangleAlert size={13} aria-hidden />
          <span className="docker-silent-text">
            {unpublished.map((p) => `:${p}`).join("・")} を Mac に出していません。ポートの取り合いで起動に失敗したコンテナは、あとで起動してもポートを出さないまま動きます
          </span>
          <button type="button" className="btn" data-size="sm" disabled={busy} data-tip={`${s.name} のコンテナを作り直して起動します（ボリュームのデータは残ります）`} onClick={() => run("recreate")}>
            作り直す
          </button>
        </div>
      )}
      {silent.map((x) => (
        <SilentConflictRow key={`${x.container}:${x.port}:${x.pid}`} projectId={projectId} service={s.name} conflict={x} busy={busy} onStopContainer={() => send("stop_container", { container: x.container })} />
      ))}
      <DockerOneoffs service={s} busy={busy} onStop={(container) => send("stop_container", { container })} onLogs={() => onLogs([`${s.name} · 使い捨て`])} />
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={`${s.name} の操作`} onClose={menu.close}>
          <DockerActionItems specs={specs} run={perform} />
        </PopupMenu>
      )}
    </div>
  );
}
