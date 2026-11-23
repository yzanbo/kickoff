import { Check, ChevronRight, FileCheck2, SquareArrowOutUpRight } from "lucide-react";
import { useContext, useRef } from "react";
import type { GitFileChange } from "@shared/git/types";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { cx } from "@/foundation/ui/lib/cx";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { IconButton, RefreshButton } from "@/foundation/ui/kit/IconButton";
import { PathParts } from "@/foundation/ui/kit/PathParts";
import { FileLinkContext } from "@/features/files/ui/links/fileLinkContext";
import { WorkplaceProvider } from "@/foundation/ui/workplace/workplaceContext";
import { DiffLayoutToggle } from "@/foundation/ui/diff/DiffLayoutToggle";
import { GIT_CHANGE_LABELS } from "@shared/git/labels";
import { DiffView, useFileDiff } from "./DiffView";
import { FileIcon } from "@/foundation/ui/code/FileIcon";
import { changedFiles } from "@/features/git/ui/changes/changeGroups";
import { useViewedFiles, type ViewedFiles } from "@/features/git/ui/diff/useViewedFiles";
import { DiffStack, type StackFold } from "@/features/git/ui/diff/DiffStack";
import { useCodeQuoteMenu } from "@/features/files/ui/useCodeQuoteMenu";
import { useGitStatus } from "./useGitStatus";
import { PopOutTabButton } from "@/features/panel/ui/tabs/PopOutTabButton";
import { GitInitNotice } from "@/features/projects/ui/GitInitNotice";

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
 * 押したファイル（focus）の位置へ移る。ファイルごとに畳め、一覧を押すとそのファイルへ移る。差分はファイルタブと同じ（DiffView。表示のしかたも共通）。
 * チャットが動いた・ウィンドウに戻ったら取り直す（useGitStatus）
 */
export function SideChanges(props: Props) {
  return (
    <WorkplaceProvider value={{ projectId: props.projectId, worktree: props.worktree ?? null }}>
      <ChangesStack {...props} />
    </WorkplaceProvider>
  );
}

function ChangesStack({ projectId, worktree, focus, focusAt }: Props) {
  const git = useGitStatus({ projectId, worktree: worktree ?? null });
  // 差分の行の右クリックは「メインのチャット」に足すメニュー（パスは作業場所のフルパス）
  const { projectsById } = useProjects();
  const codeMenu = useCodeQuoteMenu({ projectId, dir: worktree ?? projectsById.get(projectId)?.repo_path });
  const files = changedFiles(git.status).map(({ file, staged }) => ({ path: file.path, file, staged }));
  // 確認済みにしたファイル（作業場所ごとに覚える。もう変更のないファイルの印は外す）
  const viewed = useViewedFiles(`${projectId}:${worktree ?? ""}`, git.status ? files.map((f) => f.path) : null);
  const scroller = useRef<HTMLDivElement>(null);
  // ファイルの右クリックのメニュー（開き方・外のアプリ・パスのコピー。チャットの画面の FileLinksProvider のもの）
  const links = useContext(FileLinkContext);

  if (git.status && !git.status.repo) {
    return <GitInitNotice projectId={projectId} onStarted={git.refresh} className="side-changes-empty" />;
  }
  return (
    <div className="side-changes">
      <header className="side-changes-head bar">
        <span className="side-changes-count">{git.status ? `${files.length} 個のファイルを変更` : "読み込み中…"}</span>
        {files.length > 0 && (
          <span className="muted small" title="見出しの「確認済み」で、確認したファイルを畳めます（あとで変わると知らせます）">
            確認済み {viewed.count}/{files.length}
          </span>
        )}
        <span className="muted small">{worktree ? "ワークツリー" : "本体"}・コミットしていない変更</span>
        <span className="spacer" />
        <DiffLayoutToggle />
        <RefreshButton label="取り直す" busy={git.refreshing} onClick={git.refresh} />
        <PopOutTabButton />
      </header>
      <ErrorText message={git.error} className="side-changes-error" />
      <div ref={scroller} className="side-changes-body" onContextMenu={codeMenu.onContextMenu}>
        {git.status && files.length === 0 ? (
          <EmptyState icon={FileCheck2} title="コミットしていない変更はありません" className="side-changes-empty">
            この作業場所のファイルは、どれも最後のコミットのままです。
          </EmptyState>
        ) : (
          <DiffStack
            files={files}
            scroller={scroller}
            focus={focus}
            focusAt={focusAt}
            // ファイルの一覧（押すとその差分へ移る）
            list={(reveal) => (
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
                      {viewed.stateOf(file.path) === "viewed" && <Check size={12} className="side-changes-viewed" aria-label="確認済み" />}
                      <span className="change-kind side-changes-kind" data-kind={file.kind}>
                        {GIT_CHANGE_LABELS[file.kind]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            section={({ file, staged }, fold) => <ChangeSection projectId={projectId} worktree={worktree} file={file} staged={staged} version={git.version} fold={fold} viewed={viewed} />}
          />
        )}
      </div>
      {codeMenu.element}
    </div>
  );
}

/**
 * 1 つのファイルの見出し（開閉・名前・変更の種類・確認済み・エディタで開く）と差分。確認済みのファイルは畳んでいても差分を読み（確認したあとで変わったかを見るため）、
 * 開いていれば同じものを出す。確認済みは確認したときの差分の指紋と比べ、変わっていれば「確認後に変更」と出して開く
 */
function ChangeSection({ projectId, worktree, file, staged, version, fold, viewed }: { projectId: number; worktree?: string; file: GitFileChange; staged: boolean; version: number; fold: StackFold; viewed: ViewedFiles }) {
  const state = viewed.stateOf(file.path);
  // 差分を読むのは、開いている・確認済みの印がある（あとで変わったかを見る）ファイルだけ（畳んだファイルが多くても、取り直すたびに全部は読まない）
  const source = useFileDiff({ projectId, file, staged, version, active: state !== "none" || (fold.override ?? fold.byDefault), onLoad: (diff) => viewed.noteDiff(file.path, diff) });
  const fingerprint = viewed.fingerprintOf(file.path);
  const open = fold.override ?? (state === "viewed" ? false : fold.byDefault || state === "changed");
  const links = useContext(FileLinkContext);
  const openInEditor = () => (links ? links.openInEditor({ path: file.path }) : openTarget({ kind: "file", projectId, path: file.path, worktree }));
  const mark = (on: boolean) => {
    if (on) {
      viewed.mark(file.path);
      // 確認したファイルは畳む（決まりに戻すので、あとで変わったらまた開く）
      fold.reset();
    } else {
      viewed.unmark(file.path);
      fold.set(true);
    }
  };
  return (
    // data-quote-path: 差分の行を選んでチャットに足すとき（useCodeQuoteMenu・SideSelectionAttach）に読む
    <section className="side-change" data-change-path={file.path} data-quote-path={file.path}>
      <div className="side-change-head" onContextMenu={(e) => links?.showMenu(e, { path: file.path })}>
        <button type="button" className="side-change-toggle" aria-expanded={open} title={open ? "差分を畳む" : "差分を開く"} onClick={() => fold.set(!open)}>
          <ChevronRight size={13} className={cx("side-change-chevron", open && "open")} aria-hidden />
          <FileIcon name={file.path} />
          <PathParts path={file.old_path ? `${file.old_path} → ${file.path}` : file.path} nameClass="side-changes-name" dirClass="side-changes-dir" />
          <span className="change-kind side-changes-kind" data-kind={file.kind}>
            {GIT_CHANGE_LABELS[file.kind]}・{staged ? "ステージ済み" : "未ステージ"}
          </span>
        </button>
        {state === "changed" && (
          <span className="side-change-changed" title="確認済みにしたあとで、このファイルの差分が変わりました">
            確認後に変更
          </span>
        )}
        <label
          className={cx("side-change-viewed", state === "viewed" && "on")}
          title={
            state === "viewed" ? "確認済みを外す" : fingerprint === undefined ? "差分を開くと、確認済みにできます" : "確認済みにする（差分を畳み、あとで変わったら知らせます）"
          }
        >
          <input type="checkbox" checked={state === "viewed"} disabled={fingerprint === undefined} onChange={(e) => mark(e.target.checked)} />
          確認済み
        </label>
        <IconButton icon={SquareArrowOutUpRight} iconSize={13} label="ファイルタブで開く" onClick={openInEditor} />
      </div>
      {open && <DiffView projectId={projectId} file={file} staged={staged} version={version} bare source={source} />}
    </section>
  );
}
