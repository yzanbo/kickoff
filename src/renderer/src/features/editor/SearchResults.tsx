import { Copy, Replace, ReplaceAll, X } from "lucide-react";
import { useMemo, type MouseEvent } from "react";
import type { SearchMatch } from "@shared/types";
import { searchPattern, splitMatches, splitReplacements } from "@shared/search/searchMatch";
import { cx } from "@/lib/cx";
import { baseName } from "@/lib/format";
import { lineLocation } from "@/lib/pathCopy";
import { Chevron } from "@/ui/Chevron";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { PathParts } from "@/ui/PathParts";
import { useContextMenu } from "@/ui/useContextMenu";
import { FileIcon } from "./FileIcon";
import type { SearchFileResult } from "./searchHits";
import type { ProjectSearchController } from "./useProjectSearch";
import type { SearchReplaceController } from "./useSearchReplace";

interface Props {
  search: ProjectSearchController;
  replacer: SearchReplaceController;
  /** 閉じているファイル */
  collapsed: ReadonlySet<string>;
  onToggleFile: (path: string) => void;
  /** 選んでいる結果（ファイルと行） */
  selected?: { path: string; line?: number };
  onSelect: (path: string, line: number) => void;
}

/** 右クリックのメニューの対象（ファイルの見出しか、1 つの行） */
type MenuTarget = { file: SearchFileResult; match?: SearchMatch };

const copy = (text: string) => void navigator.clipboard.writeText(text);

/**
 * 検索の結果（ファイルごとにまとめ、見つかった部分に印を付ける。置換の欄を開いていれば、置き換えたあとの形を並べて見せる）。
 * 行・ファイルの右に、置換（置換の欄を開いているとき）と結果から外すボタン（乗せたとき・選んでいるときに出す）。同じ操作とコピーを右クリックにも置く
 */
export function SearchResults({ search, replacer, collapsed, onToggleFile, selected, onSelect }: Props) {
  const { result } = search;
  // 結果を出したときの探し方で印を付ける（打っている途中の文字ではなく）
  const pattern = useMemo(() => (result ? searchPattern(result.query) : null), [result]);
  const preview = search.showReplace ? { replace: search.replace, options: { regex: result?.query.regex ?? false, preserveCase: search.preserveCase } } : null;
  const menu = useContextMenu<MenuTarget>();
  const openMenu = (e: MouseEvent<HTMLElement>, target: MenuTarget) => {
    e.preventDefault();
    menu.open(e, target);
  };

  return (
    <>
      {search.files.map((file) => {
        const open = !collapsed.has(file.path);
        return (
          <section key={file.path} className="change-group code-search-group">
            <div className="code-search-file-row" onContextMenu={(e) => openMenu(e, { file })}>
              <button className="code-search-file" aria-expanded={open} title={file.path} onClick={() => onToggleFile(file.path)}>
                <Chevron open={open} />
                <FileIcon name={baseName(file.path)} />
                <PathParts path={file.path} nameClass="change-name" dirClass="change-dir" />
              </button>
              <span className="code-search-actions">
                {preview && <IconButton icon={ReplaceAll} size={13} label="このファイルですべて置換" disabled={replacer.busy} onClick={() => replacer.replaceFile(file)} />}
                <IconButton icon={X} size={13} label="結果から外す" onClick={() => search.dismiss(file.path)} />
              </span>
              <span className="change-count">{file.matches.length}</span>
            </div>
            {open && (
              <ul className="change-files">
                {file.matches.map((match) => {
                  const isSelected = selected?.path === file.path && selected.line === match.line;
                  // 行の頭の空白は省く（VS Code と同じ）
                  const text = match.text.trimStart();
                  return (
                    <li key={match.line} className={cx("code-search-row", isSelected && "selected")} onContextMenu={(e) => openMenu(e, { file, match })}>
                      <button className="code-search-line" aria-current={isSelected || undefined} title={`${match.line} 行目`} onClick={() => onSelect(file.path, match.line)}>
                        {preview
                          ? splitReplacements(text, pattern, preview.replace, preview.options).map((part, i) =>
                              part.replacement !== undefined ? (
                                <span key={i}>
                                  <del className="code-search-match code-search-removed">{part.text}</del>
                                  {part.replacement && <ins className="code-search-inserted">{part.replacement}</ins>}
                                </span>
                              ) : (
                                <span key={i}>{part.text}</span>
                              ),
                            )
                          : splitMatches(text, pattern).map((part, i) =>
                              part.match ? (
                                <mark key={i} className="code-search-match">
                                  {part.text}
                                </mark>
                              ) : (
                                <span key={i}>{part.text}</span>
                              ),
                            )}
                      </button>
                      <span className="code-search-actions">
                        {preview && <IconButton icon={Replace} size={13} label="この行を置換" disabled={replacer.busy} onClick={() => replacer.replaceLine(file, match.line)} />}
                        <IconButton icon={X} size={13} label="結果から外す" onClick={() => search.dismiss(file.path, match.line)} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={menu.menu.value.match ? `${menu.menu.value.match.line} 行目` : `「${baseName(menu.menu.value.file.path)}」`} onClose={menu.close}>
          {(({ file, match }) => (
            <>
              {preview && (
                <MenuItem disabled={replacer.busy} onSelect={() => (match ? replacer.replaceLine(file, match.line) : replacer.replaceFile(file))}>
                  {match ? <Replace size={14} aria-hidden /> : <ReplaceAll size={14} aria-hidden />} {match ? "この行を置換" : "このファイルですべて置換"}
                </MenuItem>
              )}
              <MenuItem onSelect={() => search.dismiss(file.path, match?.line)}>
                <X size={14} aria-hidden /> 結果から外す
              </MenuItem>
              {match && (
                <MenuItem onSelect={() => copy(match.text.trim())}>
                  <Copy size={14} aria-hidden /> 行をコピー
                </MenuItem>
              )}
              <MenuItem onSelect={() => copy(match ? lineLocation(file.path, { from: match.line, to: match.line }) : file.path)}>
                <Copy size={14} aria-hidden /> {match ? "パスと行番号をコピー" : "パスをコピー"}
              </MenuItem>
              {!match && (
                <MenuItem onSelect={() => copy(file.matches.map((m) => `${m.line}: ${m.text.trim()}`).join("\n"))}>
                  <Copy size={14} aria-hidden /> このファイルの結果をコピー
                </MenuItem>
              )}
            </>
          ))(menu.menu.value)}
        </PopupMenu>
      )}
    </>
  );
}
