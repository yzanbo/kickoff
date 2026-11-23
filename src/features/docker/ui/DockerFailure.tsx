// compose の最後の失敗の欄（何ができなかったか・ターミナルで流し直す・閉じる・どの行にも当たらないポートの相手・エラーの末尾）
import type { DockerActionBody, DockerCompose, DockerFailure as Failure } from "@shared/docker/types";
import { DOCKER_ACTION_BUSY_LABELS } from "@shared/docker/types";
import { openTab, panelKey, terminalTab } from "@/features/panel/ui";
import { CloseButton } from "@/foundation/ui/kit/IconButton";
import { conflictText, type conflictsByService } from "./dockerView";

export function DockerFailure({
  projectId,
  compose,
  failure,
  conflicts,
  stopOthers,
  stopOthersTip,
  busy,
  send,
}: {
  projectId: number;
  compose: DockerCompose;
  failure: Failure;
  conflicts: ReturnType<typeof conflictsByService> | null;
  stopOthers: string | null;
  stopOthersTip: string;
  busy: boolean;
  send: (action: DockerActionBody["action"]) => void;
}) {
  return (
    <div className="docker-failure small" role="alert">
      <div className="docker-failure-head">
        <span>{DOCKER_ACTION_BUSY_LABELS[failure.action].replace(/中…$/, "")}できませんでした{failure.service ? `（${failure.service}）` : ""}</span>
        <button
          type="button"
          className="btn"
          data-size="sm"
          onClick={() => openTab(panelKey("bottom", projectId), terminalTab({ cwd: failure.cwd, label: compose.file ?? "compose", projectId, command: failure.command, title: "docker compose" }))}
        >
          ターミナルで流し直す
        </button>
        <CloseButton label="閉じる" iconSize={14} onClick={() => send("dismiss")} />
      </div>
      {conflicts && conflicts.rest.length > 0 && (
        <div className="docker-conflicts">
          {conflicts.rest.map((c) => (
            <div key={`${c.container_id}:${c.port}`}>{conflictText(c)}</div>
          ))}
          {conflicts.rows.length === 0 && (
            <button type="button" className="btn" data-size="sm" disabled={busy} data-tip={stopOthersTip} onClick={() => send("stop_others_and_start")}>
              {stopOthers}
            </button>
          )}
        </div>
      )}
      <pre className="docker-stderr">{failure.message}</pre>
    </div>
  );
}
