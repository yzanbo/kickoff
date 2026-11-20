import { List, ListTree } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { GITHUB_DEFAULT_HOST, githubWebOrigin } from "@shared/foundation/codeHost";
import type { GitCommit, GitFileChange, GitRefs } from "@shared/git/types";
import { api } from "@/foundation/ui/api";
import { cx } from "@/foundation/ui/lib/cx";
import { baseName } from "@/foundation/ui/lib/format";
import { errorText, useQuery } from "@/foundation/ui/query";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/git/ui/storage";
import { formatDayTime } from "@/foundation/ui/lib/time";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { PathParts } from "@/foundation/ui/kit/PathParts";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { CHANGE_LABELS, DiffView } from "@/features/git/ui/DiffView";
import { FileIcon } from "@/foundation/ui/code/FileIcon";
import { FileTree } from "@/features/files/ui/FileTree";
import { buildTree, folderPaths, kindMaps } from "@/foundation/ui/kit/list/treeModel";
import { useGitTarget } from "@/foundation/ui/workplace/workplaceContext";
import { CommitSummary } from "./CommitSummary";
import type { RefTarget } from "./refTarget";

type CommitTab = "commit" | "changes";

/**
 * 履歴で選んだコミットの詳細（1 行の見出しと「コミット」「変更」のタブ）。
 * コミット: 作者・参照・SHA・親・メッセージ・変わったファイル（`CommitSummary`。ファイルを押すと「変更」でその差分）。
 * 変更: 左に変わったファイル（木・一覧）、右に選んだファイルの差分。初めは 1 つ目のファイルの差分を出す
 */
export function CommitView({
  projectId,
  commit,
  known,
  refColor,
  canPick,
  onPick,
  onRefMenu,
}: {
  projectId: number;
  commit: GitCommit;
  /** ブランチ・リモート・タグの一覧（札を手元・リモート・タグに分ける） */
  known: GitRefs | undefined;
  /** 表のこのコミットの線の色（札を同じ色で塗る） */
  refColor: string;
  canPick: (hash: string) => boolean;
  onPick: (hash: string) => void;
  onRefMenu?: (e: MouseEvent, target: RefTarget) => void;
}) {
  const { target, key: at } = useGitTarget(projectId);
  // コミットごとに読む（作業場所が変わったら同じコミットでも取り直す。その間は前の内容を出す）
  const loaded = useQuery(commit.hash, () => api.gitCommitDetail(target, commit.hash), { deps: [at] });
  const detail = loaded.data;
  // 連携先が GitHub なら、SHA の横にこのコミットの GitHub のページを開くボタンを出す（プロジェクトごとに 1 回聞く）
  const github = useQuery(["CommitView.github", projectId], () => api.projectGitHub(projectId).catch(() => null), { keepPrevious: true });
  const [file, setFile] = useState<GitFileChange>();
  const [tab, setTab] = useState<CommitTab>("changes");
  // 変わったファイルを木で出すか（初めは木）
  const [list, setList] = useSetting(storage.settings.commitFilesTree);
  // 左のファイルの一覧の幅（境目をドラッグで変える。ダブルクリックで元に戻す）
  const { paneRef: filesPaneRef, ...filesPane } = useDragSize({ setting: storage.settings.commitFilesWidth, min: 160, keep: 320 });

  // 読み込んだら 1 つ目のファイルを選ぶ（別のコミットに変わったら、読み込むまで外す）
  useEffect(() => setFile(detail?.files[0]), [detail]);
  const files = useMemo(() => detail?.files ?? [], [detail]);
  const nodes = useMemo(() => buildTree({ files: files.map((f) => f.path), ignored: [] }), [files]);
  const kinds = useMemo(() => kindMaps(files), [files]);
  // 木で閉じたフォルダ（初めは全部開いておく）
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const openFolders = useMemo(() => new Set(folderPaths(nodes).filter((p) => !closed.has(p))), [nodes, closed]);

  return (
    <div className="commit-view">
      <header className="commit-line">
        <span className="commit-author" title={commit.email}>
          {commit.author}
        </span>
        <span className="history-hash">{commit.hash.slice(0, 9)}</span>
        <span className="muted">{formatDayTime(commit.date)}</span>
        <span className="commit-line-subject" title={commit.subject}>
          {commit.subject}
        </span>
        <Segmented
          className="view-toggle"
          label="コミットの詳細の表示"
          value={tab}
          onChange={setTab}
          options={[
            { value: "commit", label: "コミット" },
            { value: "changes", label: "変更" },
          ]}
        />
      </header>
      <ErrorText message={errorText(loaded.error)} className="code-search-message" />
      {tab === "commit" ? (
        <CommitSummary
          commit={commit}
          detail={detail}
          known={known}
          refColor={refColor}
          githubUrl={github.data?.repo ? `${githubWebOrigin(github.data.host ?? GITHUB_DEFAULT_HOST)}/${github.data.repo}/commit/${commit.hash}` : null}
          canPick={canPick}
          onPick={onPick}
          onOpenFile={(f) => {
            setFile(f);
            setTab("changes");
          }}
          onRefMenu={onRefMenu}
        />
      ) : (
        <div className={cx("commit-changes", filesPane.resizing && "resizing")}>
          <aside ref={filesPaneRef} className="commit-files" style={{ width: filesPane.size }}>
            <div className="commit-files-head">
              <span className="muted small">{detail ? `${files.length} 個のファイル` : "読み込み中…"}</span>
              <span className="spacer" />
              <IconButton icon={list ? ListTree : List} label={list ? "ツリーで表示" : "一覧で表示"} size={14} onClick={() => setList(!list)} />
            </div>
            {/* 見出し（ファイルの数と表示の切り替え）は止めたまま、一覧だけを流す */}
            <div className="commit-files-body">
              {list ? (
                <ul className="change-files">
                  {files.map((f) => {
                    const selected = file?.path === f.path;
                    return (
                      <li key={f.path}>
                        <button
                          className={cx("change-file", selected && "selected")}
                          aria-current={selected || undefined}
                          title={`${f.path}（${CHANGE_LABELS[f.kind]}）`}
                          onClick={() => setFile(f)}
                        >
                          <FileIcon name={baseName(f.path)} />
                          <PathParts path={f.path} nameClass={cx("change-name", f.kind === "D" && "deleted")} dirClass="change-dir" />
                          <span className="change-kind" data-kind={f.kind}>
                            {f.kind}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <FileTree
                  nodes={nodes}
                  open={openFolders}
                  onToggle={(path) =>
                    setClosed((prev) => {
                      const next = new Set(prev);
                      if (!next.delete(path)) next.add(path);
                      return next;
                    })
                  }
                  selected={file?.path}
                  onSelect={(path) => setFile(files.find((f) => f.path === path))}
                  kinds={kinds}
                />
              )}
            </div>
          </aside>
          <div className="pane-resizer" aria-label="ファイルの一覧の幅を変える" {...filesPane.handle} />
          {file ? (
            <DiffView projectId={projectId} file={file} staged={false} version={0} commit={commit.hash} />
          ) : (
            <p className="muted small changes-hint">ファイルを選ぶと、差分を表示します。</p>
          )}
        </div>
      )}
    </div>
  );
}
