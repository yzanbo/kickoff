import { Check, ChevronRight, FileCheck2, SquareArrowOutUpRight } from "lucide-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { GitFileChange } from "@shared/types";
import { openProjectFile } from "@/app/router";
import { cx } from "@/lib/cx";
import { DIFF_LAYOUT, sideViewedFiles } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { useProjects } from "@/stores/projects";
import { EmptyState } from "@/ui/EmptyState";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { PathParts } from "@/ui/PathParts";
import { Segmented } from "@/ui/Segmented";
import { FileLinkContext } from "@/features/fileLinks/fileLinkContext";
import { WorktreeContext } from "@/features/worktree/worktreeContext";
import { CHANGE_LABELS, DiffView, useFileDiff } from "./DiffView";
import { FileIcon } from "./FileIcon";
import { changedFiles, diffFingerprint, pruneViewed, viewedStateOf } from "./sideFile";
import { useCodeQuoteMenu } from "./useCodeQuoteMenu";
import { useGitStatus } from "./useGitStatus";
import { PopOutTabButton } from "@/features/panel/tabs/PopOutTabButton";

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
 * 押したファイル（focus）の位置へ移る。ファイルごとに畳め、一覧を押すとそのファイルへ移る。差分はファイルタブと同じ（DiffView。表示のしかたも共通）。
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
  // 差分の行の右クリックは「メインのチャット」に足すメニュー（パスは作業場所のフルパス）
  const { projectsById } = useProjects();
  const codeMenu = useCodeQuoteMenu(worktree ?? projectsById.get(projectId)?.repo_path);
  const files = useMemo(() => changedFiles(git.status), [git.status]);
  const [layout, setLayout] = useSetting(DIFF_LAYOUT);
  // 自分で開閉したファイル（ないものは、確認済みなら畳み、そうでなければファイルが少なければ開き、多ければ移る先のファイルだけ開く）
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const setOpen = (path: string, open: boolean) => setToggled((m) => new Map(m).set(path, open));
  /** 自分で開閉したことを忘れて、決まり（確認済みなら畳む・確認後に変わったら開く）に戻す */
  const resetOpen = (path: string) =>
    setToggled((m) => {
      const next = new Map(m);
      next.delete(path);
      return next;
    });
  // 確認済みにしたファイル（パス → 確認したときの差分の指紋。作業場所ごとに覚える。もう変更のないファイルの印は外す）
  const [viewed, setViewed] = useSetting(sideViewedFiles(`${projectId}:${worktree ?? ""}`));
  useEffect(() => {
    if (!git.status) return;
    const next = pruneViewed(viewed, files.map((f) => f.file.path));
    if (next !== viewed) setViewed({ ...next });
  }, [git.status, files, viewed, setViewed]);
  const markViewed = (path: string, fingerprint: string | undefined) => {
    if (fingerprint === undefined) return;
    setViewed({ ...viewed, [path]: fingerprint });
    // 確認したファイルは畳む（決まりに戻すので、あとで変わったらまた開く）
    resetOpen(path);
  };
  const unmarkViewed = (path: string) => {
    const { [path]: _, ...rest } = viewed;
    void _;
    setViewed(rest);
    setOpen(path, true);
  };
  // 確認したあとで差分が変わったファイル（確認済みに数えない。各ファイルの見出しが差分の指紋と比べて知らせる）
  const [changedSince, setChangedSince] = useState<ReadonlySet<string>>(new Set());
  const reportChanged = useCallback((path: string, changed: boolean) => {
    setChangedSince((prev) => {
      if (prev.has(path) === changed) return prev;
      const next = new Set(prev);
      if (changed) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);
  const viewedCount = files.filter((f) => viewed[f.file.path] !== undefined && !changedSince.has(f.file.path)).length;
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
        {files.length > 0 && (
          <span className="muted small" title="見出しの「確認済み」で、確認したファイルを畳めます（あとで変わると知らせます）">
            確認済み {viewedCount}/{files.length}
          </span>
        )}
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
        <PopOutTabButton />
      </header>
      <ErrorText message={git.error} className="side-changes-error" />
      <div ref={scroller} className="side-changes-body" onContextMenu={codeMenu.onContextMenu}>
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
                    {viewed[file.path] !== undefined && !changedSince.has(file.path) && <Check size={12} className="side-changes-viewed" aria-label="確認済み" />}
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
                openOverride={toggled.get(file.path)}
                openByDefault={files.length <= OPEN_ALL_MAX || file.path === focus}
                onToggle={(open) => setOpen(file.path, !open)}
                viewed={viewed}
                onMarkViewed={(fingerprint) => markViewed(file.path, fingerprint)}
                onUnmarkViewed={() => unmarkViewed(file.path)}
                onChangedSince={reportChanged}
              />
            ))}
          </>
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
function ChangeSection({
  projectId,
  worktree,
  file,
  staged,
  version,
  openOverride,
  openByDefault,
  onToggle,
  viewed,
  onMarkViewed,
  onUnmarkViewed,
  onChangedSince,
}: {
  projectId: number;
  worktree?: string;
  file: GitFileChange;
  staged: boolean;
  version: number;
  /** 自分で開閉したとき（なければ決まりで開くか決める） */
  openOverride: boolean | undefined;
  /** 確認済みでなければ初めから開くか */
  openByDefault: boolean;
  onToggle: (open: boolean) => void;
  viewed: Readonly<Record<string, string>>;
  onMarkViewed: (fingerprint: string | undefined) => void;
  onUnmarkViewed: () => void;
  /** 確認したあとで差分が変わったかを知らせる（上の帯の「確認済み n/m」に数えない） */
  onChangedSince: (path: string, changed: boolean) => void;
}) {
  // 差分を読むのは、開いている・確認済みの印がある（あとで変わったかを見る）ファイルだけ（畳んだファイルが多くても、取り直すたびに全部は読まない）
  const marked = viewed[file.path] !== undefined;
  const source = useFileDiff({ projectId, file, staged, version, active: marked || (openOverride ?? openByDefault) });
  const fingerprint = source?.diff ? diffFingerprint(source.diff) : undefined;
  const state = viewedStateOf(viewed, file.path, fingerprint);
  const open = openOverride ?? (state === "viewed" ? false : openByDefault || state === "changed");
  useEffect(() => {
    onChangedSince(file.path, state === "changed");
  }, [file.path, state, onChangedSince]);
  // 消えたら（コミットした・元に戻した）数から外す
  useEffect(() => () => onChangedSince(file.path, false), [file.path, onChangedSince]);
  const links = useContext(FileLinkContext);
  const openInEditor = () => (links ? links.openInEditor({ path: file.path }) : openProjectFile(projectId, { path: file.path, ...(worktree ? { worktree } : {}) }));
  return (
    // data-quote-path: 差分の行を選んでチャットに足すとき（useCodeQuoteMenu・SideSelectionAttach）に読む
    <section className="side-change" data-change-path={file.path} data-quote-path={file.path}>
      <div className="side-change-head" onContextMenu={(e) => links?.showMenu(e, { path: file.path })}>
        <button type="button" className="side-change-toggle" aria-expanded={open} title={open ? "差分を畳む" : "差分を開く"} onClick={() => onToggle(open)}>
          <ChevronRight size={13} className={cx("side-change-chevron", open && "open")} aria-hidden />
          <FileIcon name={file.path} />
          <PathParts path={file.old_path ? `${file.old_path} → ${file.path}` : file.path} nameClass="side-changes-name" dirClass="side-changes-dir" />
          <span className="change-kind side-changes-kind" data-kind={file.kind}>
            {CHANGE_LABELS[file.kind]}・{staged ? "ステージ済み" : "未ステージ"}
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
          <input
            type="checkbox"
            checked={state === "viewed"}
            disabled={fingerprint === undefined}
            onChange={(e) => (e.target.checked ? onMarkViewed(fingerprint) : onUnmarkViewed())}
          />
          確認済み
        </label>
        <IconButton icon={SquareArrowOutUpRight} size={13} label="ファイルタブで開く" onClick={openInEditor} />
      </div>
      {open && <DiffView projectId={projectId} file={file} staged={staged} version={version} bare source={source} />}
    </section>
  );
}
