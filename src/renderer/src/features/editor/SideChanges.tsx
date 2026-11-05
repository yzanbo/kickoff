import { ChevronRight, FileCheck2, SquareArrowOutUpRight } from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { GitFileChange } from "@shared/types";
import { openProjectFile } from "@/app/router";
import { cx } from "@/lib/cx";
import { DIFF_LAYOUT } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { PathParts } from "@/ui/PathParts";
import { Segmented } from "@/ui/Segmented";
import { FileLinkContext } from "@/features/fileLinks/fileLinkContext";
import { WorktreeContext } from "@/features/worktree/worktreeContext";
import { CHANGE_LABELS, DiffView } from "./DiffView";
import { FileIcon } from "./FileIcon";
import { changedFiles } from "./sideFile";
import { useGitStatus } from "./useGitStatus";

/** これより多いときは、初めはファイルを畳んでおく（差分を一度に読み込みすぎない。移る先のファイルだけ開く） */
const OPEN_ALL_MAX = 20;

interface Props {
  projectId: number;
  /** チャットの作業場所のワークツリーのフォルダ（本体ならなし） */
  worktree?: string;
  /** 移るファイル（作業場所からの相対パス） */
  focus?: string;
  /** 移るように頼んだ時刻（同じファイルを押し直しても移る） */
  focusAt?: number;
}

/**
 * チャットの画面の右の欄の「変更」: チャットの作業場所のコミットしていない変更のあるファイルを、上に一覧、下に差分を縦に並べて出す。
 * 押したファイル（focus）の位置へ移る。ファイルごとに畳め、一覧を押すとそのファイルへ移る。差分はエディタタブと同じ（DiffView。表示のしかたも共通）。
 * チャットが動いた・ウィンドウに戻ったら取り直す（useGitStatus）
 */
export function SideChanges(props: Props) {
  return (
    <WorktreeContext.Provider value={props.worktree}>
      <ChangesStack {...props} />
    </WorktreeContext.Provider>
  );
}

function ChangesStack({ projectId, worktree, focus, focusAt }: Props) {
  const git = useGitStatus(projectId, false, worktree);
  const files = useMemo(() => changedFiles(git.status), [git.status]);
  const [layout, setLayout] = useSetting(DIFF_LAYOUT);
  // 自分で開閉したファイル（ないものは、ファイルが少なければ開き、多ければ移る先のファイルだけ開く）
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const isOpen = (path: string) => toggled.get(path) ?? (files.length <= OPEN_ALL_MAX || path === focus);
  const setOpen = (path: string, open: boolean) => setToggled((m) => new Map(m).set(path, open));
  const scroller = useRef<HTMLDivElement>(null);
  // ファイルの右クリックのメニュー（開き方・外のアプリ・パスのコピー。チャットの画面の FileLinksProvider のもの）
  const links = useContext(FileLinkContext);

  /** そのファイルの差分の位置へ移る（畳んでいれば開く） */
  const reveal = (path: string) => {
    setOpen(path, true);
    requestAnimationFrame(() => scroller.current?.querySelector(`[data-change-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "start" }));
  };
  // 押したファイルへ移る（一覧が届くのを待つ。同じファイルを押し直したときも focusAt が変わるので移る）
  const pending = useRef<number | undefined>(undefined);
  useEffect(() => {
    pending.current = focusAt;
  }, [focusAt]);
  useEffect(() => {
    if (!focus || pending.current === undefined || !files.some((f) => f.file.path === focus)) return;
    pending.current = undefined;
    reveal(focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, focusAt, files]);

  if (git.status && !git.status.repo) {
    return <EmptyState icon={FileCheck2} title="Git で管理されていないフォルダです" className="side-changes-empty">変更を差分で見るには、Git で管理されている必要があります。</EmptyState>;
  }
  return (
    <div className="side-changes">
      <header className="side-changes-head">
        <span className="side-changes-count">{git.status ? `${files.length} 個のファイルを変更` : "読み込み中…"}</span>
        <span className="muted small">{worktree ? "ワークツリー" : "本体"}・コミットしていない変更</span>
        <span className="spacer" />
        <Segmented
          className="view-toggle"
          label="差分の表示のしかた"
          value={layout}
          onChange={setLayout}
          options={[
            { value: "split", label: "並べて表示" },
            { value: "unified", label: "まとめて表示" },
          ]}
        />
        <RefreshButton label="取り直す" busy={git.refreshing} onClick={git.refresh} />
      </header>
      <ErrorText message={git.error} className="side-changes-error" />
      <div ref={scroller} className="side-changes-body">
        {git.status && files.length === 0 ? (
          <EmptyState icon={FileCheck2} title="コミットしていない変更はありません" className="side-changes-empty">
            この作業場所のファイルは、どれも最後のコミットのままです。
          </EmptyState>
        ) : (
          <>
            {/* ファイルの一覧（押すとその差分へ移る） */}
            <ul className="side-changes-list" aria-label="変更のあるファイル">
              {files.map(({ file }) => (
                <li key={file.path}>
                  <button
                    type="button"
                    className={cx("side-changes-item", file.path === focus && "focused")}
                    title={`${file.path} の差分へ移る（右クリックでほかの開き方）`}
                    onClick={() => reveal(file.path)}
                    onContextMenu={(e) => links?.showMenu(e, { path: file.path })}
                  >
                    <FileIcon name={file.path} />
                    <PathParts path={file.path} nameClass="side-changes-name" dirClass="side-changes-dir" />
                    <span className="change-kind side-changes-kind" data-kind={file.kind}>
                      {CHANGE_LABELS[file.kind]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {files.map(({ file, staged }) => (
              <ChangeSection
                key={file.path}
                projectId={projectId}
                worktree={worktree}
                file={file}
                staged={staged}
                version={git.version}
                open={isOpen(file.path)}
                onToggle={() => setOpen(file.path, !isOpen(file.path))}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** 1 つのファイルの見出し（開閉・名前・変更の種類・エディタで開く）と差分 */
function ChangeSection({
  projectId,
  worktree,
  file,
  staged,
  version,
  open,
  onToggle,
}: {
  projectId: number;
  worktree?: string;
  file: GitFileChange;
  staged: boolean;
  version: number;
  open: boolean;
  onToggle: () => void;
}) {
  const links = useContext(FileLinkContext);
  const openInEditor = () => (links ? links.openInEditor({ path: file.path }) : openProjectFile(projectId, { path: file.path, ...(worktree ? { worktree } : {}) }));
  return (
    <section className="side-change" data-change-path={file.path}>
      <div className="side-change-head" onContextMenu={(e) => links?.showMenu(e, { path: file.path })}>
        <button type="button" className="side-change-toggle" aria-expanded={open} title={open ? "差分を畳む" : "差分を開く"} onClick={onToggle}>
          <ChevronRight size={13} className={cx("side-change-chevron", open && "open")} aria-hidden />
          <FileIcon name={file.path} />
          <PathParts path={file.old_path ? `${file.old_path} → ${file.path}` : file.path} nameClass="side-changes-name" dirClass="side-changes-dir" />
          <span className="change-kind side-changes-kind" data-kind={file.kind}>
            {CHANGE_LABELS[file.kind]}・{staged ? "ステージ済み" : "未ステージ"}
          </span>
        </button>
        <IconButton icon={SquareArrowOutUpRight} size={13} label="エディタタブで開く" onClick={openInEditor} />
      </div>
      {open && <DiffView projectId={projectId} file={file} staged={staged} version={version} bare />}
    </section>
  );
}
