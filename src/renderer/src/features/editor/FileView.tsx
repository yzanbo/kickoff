import { ArrowDown, ArrowUp, CodeXml, ExternalLink, Image, Save } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { imageFileType, isSvgFile } from "@shared/files/imageFiles";
import type { GitFileChange, GitStatus } from "@shared/types";
import { api, ApiError } from "@/api";
import { cx } from "@/lib/cx";
import { registerSavable } from "@/lib/saveAll";
import { confirmDialog } from "@/ui/dialogs";
import { useAction } from "@/hooks/useAction";
import { useHighlight } from "@/hooks/useHighlight";
import { languageOf } from "@/lib/languages";
import { useKeyedAsync } from "@/hooks/useKeyedAsync";
import { useSetting } from "@/hooks/useSetting";
import { DIFF_LAYOUT } from "@/lib/storageKeys";
import { IconButton } from "@/ui/IconButton";
import { CodeLine } from "@/ui/CodeLine";
import { ErrorText } from "@/ui/ErrorText";
import { useMainChat } from "@/features/chat/pane/mainChatContext";
import { useGitTarget } from "@/features/worktree/worktreeContext";
import { DiffLayoutToggle } from "./DiffLayoutToggle";
import { ImagePreview } from "./ImagePreview";
import { changeOf } from "./sideFile";
import { useGitBlame } from "./useGitBlame";
import { useQuickDiffBase } from "./useQuickDiffBase";

// 編集の部品（Monaco）は大きいので、ファイルの中身を初めて開いたときに読み込む
const CodeEditor = lazy(() => import("./CodeEditor"));

interface Props {
  projectId: number;
  /** プロジェクトのフォルダ（VS Code で開くときの場所に使う） */
  repoPath: string;
  path: string;
  /** 開く行（検索の結果から開いたとき。その行へ移る） */
  line?: number;
  /** 作業場所の Git の状態（見出しの「変更あり」と、行の横の Git との違いの帯に使う。まだ読んでいなければ undefined） */
  gitStatus?: GitStatus;
  /** 差分の「編集」から来たときの差分。編集しながら、その元の中身（ステージ済みなら HEAD、未ステージならステージした中身）を左に並べる */
  diffBase?: { file: GitFileChange; staged: boolean };
  version: number;
  /** 保存したとき（変更の一覧を取り直す） */
  onSaved?: () => void;
  /** 保存していない変更があるか（別のファイルを開く前に確かめる） */
  onDirtyChange?: (dirty: boolean) => void;
  /** 開いたら編集の部品にピントを置く（差分の「編集」から来たとき。チャット欄・一覧のピントを奪わないよう、ふだんは置かない） */
  autoFocus?: boolean;
}

/** 編集の始まりの中身と指紋。ignoreHash = 保存した直後の、まだ取り直す前の古い中身の指紋（ほかで変わったと見ない） */
interface EditBase {
  key: string;
  content: string;
  hash: string;
  ignoreHash?: string;
}

/**
 * ファイルの中身。VS Code と同じく、開いたらすぐ書ける編集の部品（CodeEditor）で出し、⌘S・保存ボタンで保存する（見出しに「● 未保存」）。
 * 行番号の横に、Git との違い（ステージした中身、なければコミットの中身と比べて、足した行・変えた行・消した所）を色の帯で出す。
 * 保存の前に、開いたあとでほかで（エージェントなどが）変えていないか確かめ、変わっていれば上書きするか聞く。
 * 開いている間にほかで変わったら、未保存の変更がなければそのまま読み直し、あれば知らせて読み直すか選ばせる。
 * バイナリ・大きすぎて途中までのファイルは、読むだけの表で出す。
 * 画像（png・jpg・gif・webp・ico・icns など）はプレビュー（ImagePreview）で出す。SVG はプレビューとコードを見出しのボタンで切り替える
 * （初めはプレビュー。検索の行・差分・新しいファイルから来たときはコード。書きかけの中身もプレビューに出す）。
 * 差分から編集するとき（diffBase）は、VS Code と同じく差分を見ながら編集する（左に元の中身、右に編集する中身。打つたびに差分が変わる）
 */
export function FileView({ projectId, repoPath, path, line, gitStatus, diffBase, version, onSaved, onDirtyChange, autoFocus = false }: Props) {
  // 作業場所（ワークツリー）を見ていれば、そのフォルダのファイル
  const { target, key: at, worktree } = useGitTarget(projectId);
  const key = `${at}:${path}`;
  // 同じ作業場所の同じファイルなら、取り直している間も前の中身を出す。別のファイルに変わったら読み込み中に戻る
  const loaded = useKeyedAsync(key, () => api.projectFile(target, path), { deps: [version] });
  const [stored, setBase] = useState<EditBase | null>(null);
  const [dirty, setDirty] = useState(false);
  // 保存している間と、その結果（保存しました・失敗の理由）
  const saving = useAction<"save">();
  const [editorKey, setEditorKey] = useState(0);
  const getValue = useRef<(() => string) | null>(null);
  const goToDiff = useRef<((target: "next" | "previous") => void) | null>(null);
  const [layout] = useSetting(DIFF_LAYOUT);
  // 右の欄・別ウィンドウでは、右クリックをチャットに足すメニューに任せる
  const inSide = useMainChat() !== null;
  // 差分の元の中身は開いたときに一度だけ読む（保存して差分がなくなっても、比べる相手はそのまま）。
  // undefined = 読み込み中、null = 差分なしで編集する（差分から来ていない・元がバイナリ・大きすぎる・読めない）
  const [diffOf] = useState(diffBase);
  const [original, setOriginal] = useState<string | null | undefined>(diffOf ? undefined : null);
  useEffect(() => {
    if (!diffOf) return;
    let alive = true;
    api.gitOriginal(target, diffOf.file, diffOf.staged).then(
      (o) => alive && setOriginal(o.binary || o.truncated ? null : o.content),
      () => alive && setOriginal(null),
    );
    return () => {
      alive = false;
    };
    // 開いたときだけ（同じファイル・同じ作業場所の間は FileView が作り直されない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const diffing = typeof original === "string";
  // 画像: SVG 以外はプレビューだけ。SVG はプレビューとコードを切り替える（コードの編集の部品は、初めてコードを出すまで作らない）
  const raster = imageFileType(path) !== null && !isSvgFile(path);
  const svg = isSvgFile(path);
  const [showCode, setShowCode] = useState(() => line !== undefined || Boolean(diffBase) || autoFocus);
  const [codeMounted, setCodeMounted] = useState(showCode);
  // プレビューに切り替えたときの、書きかけの中身（保存していなければ、これをプレビューに出す）
  const [svgDraft, setSvgDraft] = useState<string | null>(null);
  const previewing = svg && !showCode;
  const toggleCode = () => {
    if (showCode) setSvgDraft(getValue.current?.() ?? null);
    else setCodeMounted(true);
    setShowCode(!showCode);
  };

  const current = loaded.loaded ? { file: loaded.data, error: loaded.error } : undefined;
  const editable = Boolean(current?.file && !current.file.binary && !current.file.truncated);
  // 編集の始まり: 読み込んだ中身（作業場所が変わったら、その作業場所の中身から始め直す）
  const base: EditBase | null = stored?.key === key ? stored : editable && current?.file ? { key, content: current.file.content, hash: current.file.hash } : null;
  useEffect(() => {
    if (base && stored !== base) setBase(base);
  }, [base, stored]);

  const change = changeOf(gitStatus, path);
  const quickDiffBase = useQuickDiffBase({ target, key, gitStatus, change, version, content: base ? (current?.file?.content ?? null) : null });
  const blame = useGitBlame({ target, key, path, hash: base?.hash ?? null, version, enabled: Boolean(gitStatus?.repo) && change?.file.kind !== "U" });

  const changeDirty = (next: boolean) => {
    setDirty(next);
    if (next) saving.reset();
    onDirtyChange?.(next);
  };

  // ⌘⇧S（すべて保存）で、まだ保存していなければ保存する（⌘S と同じ。lib/saveAll）
  const savable = useRef({ dirty, saveCurrent: async () => false });
  savable.current = {
    dirty,
    saveCurrent: async () => {
      const value = getValue.current?.();
      return value !== undefined && Boolean(await save(value));
    },
  };
  useEffect(() => registerSavable({ dirty: () => savable.current.dirty, save: () => savable.current.saveCurrent() }), []);

  // 開いたときの指紋と比べて保存する。ほかで変わっていれば、上書きするか聞いてから指紋なしで保存し直す
  const save = (content: string) =>
    base &&
    saving.run(
      "save",
      async () => {
        const write = (hash: string | null) => api.saveProjectFile(target, path, content, hash);
        let saved: { hash: string };
        try {
          saved = await write(base.hash);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 409)) throw e;
          const overwrite = await confirmDialog({
            title: "ほかでファイルが変わっています",
            message: "開いたあとで、エージェントなどがこのファイルを変えました。上書きすると、その変更は消えます。",
            confirmLabel: "上書きする",
            danger: true,
          });
          if (!overwrite) throw new Error("保存していません（ほかでの変更を確かめてください）");
          saved = await write(null);
        }
        // 取り直すまでの間、読み込み済みの古い中身をほかでの変更と見ない
        setBase({ key, content, hash: saved.hash, ignoreHash: current?.file?.hash });
        onSaved?.();
      },
      { done: "保存しました" },
    );

  // 開いている間に、ほかでファイルが変わった
  const changedOnDisk = Boolean(base && current?.file && current.file.hash !== base.hash && current.file.hash !== base.ignoreHash);
  // 未保存の変更がなければ、そのまま読み直す（CodeEditor が書いている中身を差し替える）
  useEffect(() => {
    if (changedOnDisk && !dirty && current?.file) setBase({ key, content: current.file.content, hash: current.file.hash });
  }, [changedOnDisk, dirty, current?.file, key]);

  // ほかで変わった中身を読み直して、編集をやり直す（自分の変更は捨てる）
  const reloadFromDisk = async () => {
    if (dirty && !(await confirmDialog({ title: "保存していない変更を捨てて読み直しますか？", confirmLabel: "読み直す", danger: true }))) return;
    if (!current?.file) return;
    setBase({ key, content: current.file.content, hash: current.file.hash });
    setEditorKey((n) => n + 1);
    changeDirty(false);
    saving.reset();
  };

  // 読むだけの表（バイナリ・途中まで）
  const readOnly = !base && Boolean(current?.file && !current.file.binary);
  const lines = useMemo(() => current?.file?.content.replace(/\n$/, "").split("\n") ?? [], [current?.file]);
  const tokens = useHighlight(readOnly ? lines : [], languageOf(path));
  const focusRef = useRef<HTMLTableRowElement>(null);
  // 開いた行を真ん中に出す（中身を読み込んだあと・別の行を選んだとき）
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center" });
  }, [line, lines]);

  return (
    <div className="diff-view">
      <header className="diff-head">
        <span className="diff-path" title={path}>
          {path}
        </span>
        <span
          className={cx("diff-state", saving.error && "error", dirty && !saving.result && "unsaved")}
          title={base && diffing ? (diffOf?.staged ? "左はコミット（HEAD）の中身。右を編集すると、差分がその場で変わります" : "左はステージした中身（なければコミットの中身）。右を編集すると、差分がその場で変わります") : undefined}
        >
          {saving.result?.text ?? (dirty ? "● 未保存" : `${line !== undefined ? `${line} 行目・` : ""}${change ? "変更あり" : "変更なし"}`)}
        </span>
        <span className="spacer" />
        {window.kickoff && (
          <button className="btn btn-sm" title="VS Code でこのファイルを開く" onClick={() => void window.kickoff?.externalApps.openInVSCode(`${worktree ?? repoPath}/${path}`, line)}>
            <ExternalLink size={13} aria-hidden /> VS Code で開く
          </button>
        )}
        {svg && (
          <button className="btn btn-sm" aria-pressed={showCode} title={showCode ? "画像として表示します" : "SVG のコードを表示・編集します"} onClick={toggleCode}>
            {showCode ? <Image size={13} aria-hidden /> : <CodeXml size={13} aria-hidden />} {showCode ? "プレビュー" : "コードを表示"}
          </button>
        )}
        {base && diffing && (
          <>
            <IconButton icon={ArrowUp} size={14} label="前の変更へ" onClick={() => goToDiff.current?.("previous")} />
            <IconButton icon={ArrowDown} size={14} label="次の変更へ" onClick={() => goToDiff.current?.("next")} />
            <DiffLayoutToggle />
          </>
        )}
        {base && (
          <button className="btn btn-sm btn-primary" disabled={!dirty || saving.busy !== null} title="保存（⌘S）" onClick={() => getValue.current && void save(getValue.current())}>
            <Save size={13} aria-hidden /> {saving.busy ? "保存中…" : "保存"}
          </button>
        )}
      </header>
      {changedOnDisk && dirty && (
        <div className="file-changed-notice" role="status">
          開いたあとで、ほかでこのファイルが変わりました。
          <button className="btn btn-sm" onClick={() => void reloadFromDisk()}>
            読み直す
          </button>
        </div>
      )}
      <div className={cx("diff-body", (base || raster || previewing) && "editing")}>
        {raster && <ImagePreview projectId={projectId} path={path} version={version} />}
        {previewing && <ImagePreview projectId={projectId} path={path} version={version} source={base ? (dirty && svgDraft !== null ? svgDraft : base.content) : undefined} />}
        {/* コード（SVG をプレビューしている間は、書きかけの編集の部品を残したまま隠す） */}
        {!raster && (!previewing || codeMounted) && (
          <div className="file-code" hidden={previewing}>
            {base && original === undefined ? (
              <p className="muted small diff-message">編集の準備中…</p>
            ) : base ? (
              <Suspense fallback={<p className="muted small diff-message">編集の準備中…</p>}>
                <CodeEditor
                  key={`${key}:${editorKey}`}
                  path={path}
                  initialValue={base.content}
                  savedValue={base.content}
                  line={line}
                  valueRef={getValue}
                  onDirtyChange={changeDirty}
                  onSave={(content) => void save(content)}
                  original={original ?? undefined}
                  layout={layout}
                  goToDiffRef={goToDiff}
                  quickDiffBase={quickDiffBase}
                  blame={blame}
                  nativeContextMenu={!inSide}
                  autoFocus={autoFocus}
                />
              </Suspense>
            ) : !current ? (
              <p className="muted small diff-message">読み込み中…</p>
            ) : current.error ? (
              <ErrorText message={current.error} className="diff-message" />
            ) : current.file?.binary ? (
              <p className="muted small diff-message">バイナリのファイルなので、中身は表示できません。</p>
            ) : (
              // data-quote-path・data-no: 右の欄・別ウィンドウで行を選んでチャットに足すとき（useCodeQuoteMenu・SideSelectionAttach）に読む
              <table className="diff-table" data-quote-path={path}>
                <colgroup>
                  <col className="diff-col-no" />
                  <col />
                </colgroup>
                <tbody>
                  {lines.map((text, i) => (
                    <tr key={i} ref={i + 1 === line ? focusRef : undefined} className={cx(i + 1 === line && "line-focus")}>
                      <td className="diff-no">{i + 1}</td>
                      <td className="diff-code" data-no={i + 1}>
                        <CodeLine tokens={tokens?.[i]} text={text} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {readOnly && current?.file?.truncated && <p className="muted small diff-message">大きいため、途中までを表示しています（編集はできません）。</p>}
          </div>
        )}
      </div>
    </div>
  );
}
