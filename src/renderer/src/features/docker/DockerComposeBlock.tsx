import { Ellipsis, ScrollText, TriangleAlert } from "lucide-react";
import type { DockerActionBody, DockerCompose, DockerSilentConflict } from "@shared/types";
import { DOCKER_ACTION_BUSY_LABELS } from "@shared/types";
import { openProjectFile } from "@/app/router";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelKey } from "@/features/panel/surfaces";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";
import { confirmDialog } from "@/ui/dialogs";
import { CloseButton, IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { DockerServiceRow } from "./DockerServiceRow";
import { conflictText, conflictsByService, shareText, stopOthersLabel } from "./dockerView";

export type DockerAct = (body: DockerActionBody) => Promise<void>;

/** 確かめてから流す（元に戻せないものだけ。片付け・作り直して起動） */
async function confirmed(compose: DockerCompose, action: "down" | "recreate"): Promise<boolean> {
  const scaled = compose.services.some((s) => s.containers.length > 1);
  if (action === "down")
    return confirmDialog({
      title: "片付けますか？",
      message: "コンテナとネットワークを消します（使い捨てのコンテナも消します）。ボリューム（DB のデータ）は残ります。",
      confirmLabel: "片付ける",
      danger: true,
    });
  return confirmDialog({
    title: "作り直して起動しますか？",
    message: `新しい設定でコンテナを作り直します。データ（ボリューム）は残ります。${scaled ? "数を増やしたサービスは 1 つに戻ります。" : ""}`,
    confirmLabel: "作り直して起動",
  });
}

/**
 * compose のファイル 1 つ（見出しの行・⚠・動いている操作・最後の失敗・サービスの行）。
 * 見出しの操作はいつもボタンで出し（すべて起動・すべて停止・⋯）、同じものを見出しの右クリックにも入れる
 */
export function DockerComposeBlock({
  projectId,
  compose,
  act,
  silent,
  onLogs,
}: {
  projectId: number;
  compose: DockerCompose;
  act: DockerAct;
  /** 静かなぶつかり（コンテナの ID ごと） */
  silent: Record<string, DockerSilentConflict[]>;
  onLogs: (chips: string[] | null) => void;
}) {
  const menu = useContextMenu();
  const busy = compose.operation !== null;
  const send = (action: DockerActionBody["action"], extra: Partial<DockerActionBody> = {}) => void act({ action, compose: compose.key, ...extra });
  const guarded = async (action: "down" | "recreate") => {
    if (await confirmed(compose, action)) send(action);
  };
  const openFile = () => compose.file && openProjectFile(projectId, { path: compose.file, ...(compose.worktree_path ? { worktree: compose.worktree_path } : {}) });
  const anyRunning = compose.services.some((s) => s.running > 0 || s.oneoffs.some((c) => c.state === "running"));
  const failure = compose.failure;
  // ポートの取り合いの相手は、ぶつかったサービスの行に出す（［相手を止めて起動］は最初の行に 1 つだけ。どの行にも当たらない相手は失敗の中に）
  const conflicts = failure && failure.conflicts.length > 0 ? conflictsByService(compose.services, failure) : null;
  const stopOthers = failure && conflicts ? stopOthersLabel(failure.conflicts) : null;
  const stopOthersTip = "相手を docker stop してから、起動できなかったサービスを作り直して起動します（どちらもボリュームのデータは残ります）";

  return (
    <section className="docker-compose" aria-label={compose.file ?? compose.project_name ?? "compose"}>
      <div className="docker-compose-head" onContextMenu={(e) => menu.open(e)}>
        <button type="button" className="docker-compose-file" disabled={!compose.file} onClick={openFile} data-tip="compose のファイルを開く">
          {compose.file ?? compose.project_name ?? "（ファイルなし）"}
        </button>
        <WorktreeChip chat={{ project_id: projectId, worktree_path: compose.worktree_path, branch: compose.branch }} markIconOnly />
        {compose.project_name && (
          <span className="docker-compose-name muted small" data-tip="組の名前（compose のプロジェクト名）">
            {compose.project_name}
          </span>
        )}
        {!compose.created && <span className="muted small">（作っていない）</span>}
        <span className="docker-compose-actions">
          {busy ? (
            <span className="docker-compose-busy small">
              {DOCKER_ACTION_BUSY_LABELS[compose.operation!.action]}
              {compose.operation!.service && ` ${compose.operation!.service}`}
              {compose.operation!.cancellable && (
                <button type="button" className="btn btn-sm" onClick={() => send("cancel")}>
                  中止
                </button>
              )}
            </span>
          ) : (
            <>
              {compose.config_changed && (
                <button type="button" className="btn btn-sm" onClick={() => void guarded("recreate")} data-tip="設定が変わっています">
                  作り直して起動
                </button>
              )}
              <button type="button" className="btn btn-sm" disabled={compose.start_blocked !== null} title={compose.start_blocked ?? undefined} onClick={() => send("start_all")}>
                すべて起動
              </button>
              <button type="button" className="btn btn-sm" disabled={!anyRunning} onClick={() => send("stop_all")}>
                すべて停止
              </button>
            </>
          )}
          <button type="button" className="btn btn-sm" disabled={!compose.created} data-tip="すべてのサービスのログを、時刻の順に一覧の下に出す" onClick={() => onLogs(null)}>
            <ScrollText size={13} aria-hidden /> ログ
          </button>
          <IconButton icon={Ellipsis} label="compose の操作" className="docker-compose-more" onClick={(e) => menu.toggle(e)} />
        </span>
      </div>
      {compose.shares.map((share, i) => (
        <p key={i} className="docker-warning small">
          <TriangleAlert size={13} aria-hidden />
          {shareText(share, compose)}
        </p>
      ))}
      {compose.config_error && (
        <div className="docker-warning small">
          <TriangleAlert size={13} aria-hidden />
          <div>
            設定を読めませんでした
            <pre className="docker-stderr">{compose.config_error}</pre>
          </div>
        </div>
      )}
      {failure && (
        <div className="docker-failure small" role="alert">
          <div className="docker-failure-head">
            <span>{DOCKER_ACTION_BUSY_LABELS[failure.action].replace(/中…$/, "")}できませんでした{failure.service ? `（${failure.service}）` : ""}</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                panelActions(panelKey("bottom", projectId)).openTerminal({ cwd: failure.cwd, label: compose.file ?? "compose", projectId, command: failure.command, title: "docker compose" })
              }
            >
              ターミナルで流し直す
            </button>
            <CloseButton label="閉じる" size={14} onClick={() => send("dismiss")} />
          </div>
          {conflicts && conflicts.rest.length > 0 && (
            <div className="docker-conflicts">
              {conflicts.rest.map((c) => (
                <div key={`${c.container_id}:${c.port}`}>{conflictText(c)}</div>
              ))}
              {conflicts.rows.length === 0 && (
                <button type="button" className="btn btn-sm" disabled={busy} data-tip={stopOthersTip} onClick={() => send("stop_others_and_start")}>
                  {stopOthers}
                </button>
              )}
            </div>
          )}
          <pre className="docker-stderr">{failure.message}</pre>
        </div>
      )}
      <div className="docker-services">
        {compose.services.map((s) => {
          const row = conflicts?.rows.findIndex((r) => r.service === s.name) ?? -1;
          return (
            <DockerServiceRow
              key={s.name}
              projectId={projectId}
              compose={compose}
              service={s}
              busy={busy}
              send={send}
              silent={silent}
              onLogs={onLogs}
              conflicts={row >= 0 ? conflicts!.rows[row].conflicts : []}
              stopOthers={row === 0 && stopOthers ? { label: stopOthers, tip: stopOthersTip } : null}
            />
          );
        })}
      </div>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="compose の操作" ignore=".docker-compose-more" onClose={menu.close}>
          <MenuItem disabled={busy || compose.start_blocked !== null} title={compose.start_blocked ?? undefined} onSelect={() => send("start_all")}>
            すべて起動
          </MenuItem>
          <MenuItem disabled={busy || !anyRunning} onSelect={() => send("stop_all")}>
            すべて停止
          </MenuItem>
          <MenuItem disabled={busy || !anyRunning} onSelect={() => send("restart_all")}>
            すべて再起動
          </MenuItem>
          {compose.config_changed && (
            <MenuItem disabled={busy} onSelect={() => void guarded("recreate")}>
              作り直して起動…
            </MenuItem>
          )}
          <MenuItem danger disabled={busy || !compose.created || compose.down_blocked !== null} title={compose.down_blocked ?? undefined} onSelect={() => void guarded("down")}>
            片付け…
          </MenuItem>
          <div className="menu-separator" role="separator" />
          <MenuItem disabled={!compose.created} onSelect={() => onLogs(null)}>
            ログ
          </MenuItem>
          <MenuItem disabled={!compose.file} onSelect={openFile}>
            compose のファイルを開く
          </MenuItem>
        </PopupMenu>
      )}
    </section>
  );
}
