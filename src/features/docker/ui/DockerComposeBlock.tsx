import "./DockerComposeBlock.css";
import { Ellipsis, ScrollText, TriangleAlert } from "lucide-react";
import type { DockerActionBody, DockerCompose, DockerSilentConflict } from "@shared/docker/types";
import { DOCKER_ACTION_BUSY_LABELS } from "@shared/docker/types";
import { open } from "@/foundation/ui/navigation/open";
import { WorktreeChip } from "@/foundation/ui/workplace/WorktreeChip";
import { confirm } from "@/foundation/ui/kit/ask";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { DockerActionItems } from "./DockerActionItems";
import { composeActions, specOf, type ComposeActionId } from "./dockerActions";
import { DockerFailure } from "./DockerFailure";
import { DockerServiceRow } from "./DockerServiceRow";
import { conflictsByService, shareText, stopOthersLabel } from "./dockerView";

export type DockerAct = (body: DockerActionBody) => Promise<void>;

/** 確かめてから流す（元に戻せないものだけ。片付け・作り直して起動） */
async function confirmed(compose: DockerCompose, action: "down" | "recreate"): Promise<boolean> {
  const scaled = compose.services.some((s) => s.containers.length > 1);
  if (action === "down")
    return confirm({
      title: "片付けますか？",
      message: "コンテナとネットワークを消します（使い捨てのコンテナも消します）。ボリューム（DB のデータ）は残ります。",
      confirmLabel: "片付ける",
      danger: true,
    }).then((r) => r !== null);
  return confirm({
    title: "作り直して起動しますか？",
    message: `新しい設定でコンテナを作り直します。データ（ボリューム）は残ります。${scaled ? "数を増やしたサービスは 1 つに戻ります。" : ""}`,
    confirmLabel: "作り直して起動",
  }).then((r) => r !== null);
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
  const openFile = () => compose.file && open({ kind: "file", projectId, path: compose.file, worktree: compose.worktree_path });
  // 押せる条件と理由は操作の表（見出しのボタンもメニューもここを読む）
  const specs = composeActions(compose);
  const spec = (id: ComposeActionId) => specOf(specs, id);
  const perform = (id: ComposeActionId) => {
    if (id === "recreate" || id === "down") void guarded(id);
    else if (id === "logs") onLogs(null);
    else if (id === "file") openFile();
    else send(id);
  };
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
                <button type="button" className="btn" data-size="sm" onClick={() => send("cancel")}>
                  中止
                </button>
              )}
            </span>
          ) : (
            <>
              {compose.config_changed && (
                <button type="button" className="btn" data-size="sm" disabled={spec("recreate")?.disabled} onClick={() => perform("recreate")} data-tip="設定が変わっています">
                  作り直して起動
                </button>
              )}
              <button type="button" className="btn" data-size="sm" disabled={spec("start_all")?.disabled} title={spec("start_all")?.title} onClick={() => perform("start_all")}>
                すべて起動
              </button>
              <button type="button" className="btn" data-size="sm" disabled={spec("stop_all")?.disabled} onClick={() => perform("stop_all")}>
                すべて停止
              </button>
            </>
          )}
          <button type="button" className="btn" data-size="sm" data-tip={compose.created ? "すべてのサービスのログを、時刻の順に一覧の下に出す" : "すべてのサービスのログを一覧の下に出す（まだ起動していません。起動したら流れ始めます）"} onClick={() => perform("logs")}>
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
      {failure && <DockerFailure projectId={projectId} compose={compose} failure={failure} conflicts={conflicts} stopOthers={stopOthers} stopOthersTip={stopOthersTip} busy={busy} send={send} />}
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
          <DockerActionItems specs={specs} run={perform} />
        </PopupMenu>
      )}
    </section>
  );
}
