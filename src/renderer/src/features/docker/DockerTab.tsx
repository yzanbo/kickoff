import { useState } from "react";
import { Container } from "lucide-react";
import type { DockerList } from "@shared/types";
import { CopyButton } from "@/ui/CopyButton";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorText } from "@/ui/ErrorText";
import { RefreshButton } from "@/ui/IconButton";
import { DockerComposeBlock } from "./DockerComposeBlock";
import { othersTip } from "./dockerView";
import { useDocker } from "./useDocker";

/**
 * プロジェクトの「Docker」タブ（要件 5.14 の段階 1）: 本体とワークツリーの compose ごとに見出しとサービスの行を並べ、起動・停止・シェルを出す。
 * エンジンが入っていない・動いていないときは理由と、開くボタン（context の名前から決めたもの）を出す
 */
export function DockerTab({ projectId }: { projectId: number }) {
  const docker = useDocker(projectId);
  const { list, error } = docker;
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    void docker.reload({ refresh: true }).finally(() => setRefreshing(false));
  };

  return (
    <div className="docker-tab">
      <div className="docker-tab-head">
        <h2 className="docker-tab-title">Docker</h2>
        {list?.context && <span className="docker-tab-context muted small" data-tip="docker context show">{list.context}</span>}
        <span className="docker-tab-spacer" />
        <RefreshButton label="取り直す（compose の設定も読み直す）" busy={refreshing} onClick={refresh} />
      </div>
      <ErrorText message={error ?? ""} />
      {!list ? (
        !error && <div className="muted small docker-tab-loading">読み込み中…</div>
      ) : list.engine !== "ok" ? (
        <EngineDown list={list} onOpen={() => void docker.openEngine()} onRetry={() => void docker.reload({ watch: true })} />
      ) : list.composes.length === 0 ? (
        <EmptyState icon={Container} title="compose のファイルがありません">
          <p>本体と各ワークツリーの直下（compose.yaml・docker-compose.yml・compose.*.yaml など）と、2 段下までのフォルダの compose のファイルを探しました。</p>
          <p className="muted small">ファイルを足したら ［↻］ で取り直してください。</p>
        </EmptyState>
      ) : (
        <div className="docker-composes">
          {list.composes.map((c) => (
            <DockerComposeBlock key={c.key} projectId={projectId} compose={c} act={docker.act} />
          ))}
        </div>
      )}
      {list && list.engine === "ok" && list.others.length > 0 && (
        <div className="docker-others muted small" data-tip={othersTip(list.others)} data-tip-title="ほかのプロジェクトのコンテナ">
          ほかのプロジェクトで動いているコンテナ {list.others.length} 個
        </div>
      )}
    </div>
  );
}

/** エンジンが入っていない・動いていないときの案内 */
function EngineDown({ list, onOpen, onRetry }: { list: DockerList; onOpen: () => void; onRetry: () => void }) {
  const retry = (
    <button type="button" className="btn btn-sm" onClick={onRetry}>
      もう一度確かめる
    </button>
  );
  if (list.engine === "missing")
    return (
      <EmptyState icon={Container} title="Docker が入っていません" actions={retry}>
        <p>docker コマンドが見つかりませんでした。OrbStack・Docker Desktop・Colima のどれかを入れると、ここに compose のサービスが並びます。</p>
        <p className="muted small">Homebrew なら brew install --cask orbstack など。</p>
      </EmptyState>
    );
  const starter = list.starter;
  return (
    <EmptyState
      icon={Container}
      title="Docker が動いていません"
      actions={
        <>
          {starter?.kind === "open" && (
            <button type="button" className="btn btn-sm btn-primary" onClick={onOpen}>
              {starter.label}
            </button>
          )}
          {retry}
        </>
      }
    >
      <p>docker version に答えがありませんでした{list.context ? `（context: ${list.context}）` : ""}。エンジンを起動すると、自動で一覧に戻ります。</p>
      {starter?.kind === "copy" && (
        <p className="docker-starter-command">
          <code>{starter.command}</code>
          <CopyButton label="コマンドをコピー" text={starter.command} />
          <span className="muted small">をターミナルで流してください。</span>
        </p>
      )}
      {!starter && <p className="muted small">いま選ばれている context のエンジンを起動してください。</p>}
    </EmptyState>
  );
}
