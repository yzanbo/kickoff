import { ArrowDown, ArrowUp, ExternalLink, Save } from "lucide-react";
import type { RefObject } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { DiffLayoutToggle } from "@/foundation/ui/diff/DiffLayoutToggle";
import { canOpenExternal, openExternal } from "@/foundation/ui/external/native";
import { PreviewToggle, WrapToggle } from "./FileViewButtons";
import type { PreviewMode } from "./usePreviewMode";

interface Props {
  path: string;
  /** VS Code で開くときの絶対パス */
  absolutePath: string;
  line?: number;
  /** 様子の欄（保存しました・失敗の理由・● 未保存・行と変更の有無） */
  state: { text: string; error: boolean; unsaved: boolean; title?: string };
  /** 折り返しの切り替えを出すか（コード・読むだけの表を出しているとき） */
  wrap: { shown: boolean; on: boolean; set: (wrap: boolean) => void };
  preview: PreviewMode;
  /** プレビューとコードを切り替える */
  onTogglePreview: () => void;
  /** 差分を見ながら編集しているときの前・次の変更へ（していなければ null） */
  goToDiff: RefObject<((target: "next" | "previous") => void) | null> | null;
  /** 保存（編集できるときだけ。null なら出さない） */
  save: { dirty: boolean; busy: boolean; run: () => void } | null;
}

/** ファイルの中身（FileView）の見出し: パス・様子・VS Code で開く・折り返し・プレビューの切り替え・差分の前後・保存 */
export function FileHeader({ path, absolutePath, line, state, wrap, preview, onTogglePreview, goToDiff, save }: Props) {
  return (
    <header className="diff-head bar">
      <span className="diff-path" title={path}>
        {path}
      </span>
      <span className={cx("diff-state", state.error && "error", state.unsaved && "unsaved")} title={state.title}>
        {state.text}
      </span>
      <span className="spacer" />
      {canOpenExternal() && (
        <button className="btn" data-size="sm" title="VS Code でこのファイルを開く" onClick={() => void openExternal({ kind: "vscode", path: absolutePath, line })}>
          <ExternalLink size={13} aria-hidden /> VS Code で開く
        </button>
      )}
      {wrap.shown && <WrapToggle wrap={wrap.on} onChange={wrap.set} />}
      {preview.kind !== null && preview.kind !== "raster" && <PreviewToggle kind={preview.kind} showCode={preview.showCode} onClick={onTogglePreview} />}
      {goToDiff && (
        <>
          <IconButton icon={ArrowUp} iconSize={14} label="前の変更へ" onClick={() => goToDiff.current?.("previous")} />
          <IconButton icon={ArrowDown} iconSize={14} label="次の変更へ" onClick={() => goToDiff.current?.("next")} />
          <DiffLayoutToggle />
        </>
      )}
      {save && (
        <button className="btn btn-primary" data-size="sm" disabled={!save.dirty || save.busy} title="保存（⌘S）" onClick={save.run}>
          <Save size={13} aria-hidden /> {save.busy ? "保存中…" : "保存"}
        </button>
      )}
    </header>
  );
}
