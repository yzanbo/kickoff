import { ExternalLink, FilePlus, FolderPlus, FolderSearch, Minus, Pencil, Plus, Trash2, Undo2, type LucideIcon } from "lucide-react";
import { baseName } from "@/foundation/ui/lib/format";
import { parentPath } from "@/foundation/ui/kit/list/treeModel";
import type { PickedEntry } from "./FileTree";
import type { FileGitAction } from "./filesGit";

/** 右クリックした行（null は木の下の空いている所。staged は変更の一覧のどちらのまとまりか。many は選んだいくつかの行の 1 つを右クリックしたときの、選んでいるものすべて） */
export type FileMenuTarget = { path: string; dir: boolean; ignored: boolean; staged?: boolean; many: PickedEntry[] | null } | null;

/** メニューの項目 1 つ（explorer: ファイルタブだけ・changes: 変更タブだけ） */
export interface FileMenuAction {
  label: string;
  icon: LucideIcon;
  title?: string;
  danger?: boolean;
  only?: "explorer" | "changes";
  run: () => void;
}

/** 項目の組（paths は土台の PathMenuItems = 外のアプリとパスのコピー） */
export type FileMenuGroup = { kind: "actions"; items: FileMenuAction[] } | { kind: "paths"; paths: string[]; dir: boolean };

/** メニューから呼ぶ操作 */
export interface FileMenuContext {
  /** ファイルタブ（エクスプローラー）の右クリックか（新しいファイル・ゴミ箱を出す） */
  explorer: boolean;
  startCreate: (parent: string, dir: boolean) => void;
  startRename: (path: string) => void;
  trash: (entries: PickedEntry[]) => void;
  runGit: (action: FileGitAction, paths: string[]) => void;
  /** ファイルを新しいタブで開く（staged は変更の一覧から開くときのまとまり。差分を出す） */
  openTab: (path: string, staged?: boolean) => void;
  /** 変更の一覧から、プロジェクトのファイルタブに移って実際のファイルを開く */
  openInFilesTab: (path: string) => void;
  onFindInFolder?: (folder: string) => void;
}

/** メニューの見出し（読み上げの名前） */
export function fileMenuLabel(target: FileMenuTarget): string {
  if (target?.many) return `選んだ ${target.many.length} 件の操作`;
  return target ? `「${baseName(target.path)}」` : "ファイルの操作";
}

const group = (items: (FileMenuAction | false | undefined)[]): FileMenuGroup => ({ kind: "actions", items: items.filter((i): i is FileMenuAction => Boolean(i)) });

/**
 * ファイルの木・変更の一覧の右クリックの項目（VS Code のエクスプローラーと同じ並び）: 新しいファイル / フォルダー（ファイルタブ）・開く・フォルダー内を検索・
 * 外のアプリとパスのコピー・名前の変更とゴミ箱（ファイルタブ）。いくつか選んでいれば、すべてに効く組（新しいタブで開く・ステージ / 取り消し / 元に戻す・パスのコピー・ゴミ箱）。
 * ファイルタブ・変更タブの出し分けは最後に 1 か所で。空の組は返さない
 */
export function fileMenuItems(target: FileMenuTarget, ctx: FileMenuContext): FileMenuGroup[] {
  const groups = target?.many ? manyGroups(target.many, ctx) : oneGroups(target, ctx);
  return groups
    .map((g) => (g.kind === "actions" ? { ...g, items: g.items.filter((i) => !i.only || (i.only === "explorer") === ctx.explorer) } : g))
    .filter((g) => g.kind === "paths" || g.items.length > 0);
}

function oneGroups(value: FileMenuTarget, ctx: FileMenuContext): FileMenuGroup[] {
  // 新しく作る場所（フォルダーの行ならその中、ファイルの行ならその入ったフォルダー、空いている所ならいちばん外側）。無視しているフォルダーの中には作らない（開けないため）
  const folder = value === null ? "" : value.dir ? value.path : parentPath(value.path);
  const canCreate = !(value?.dir && value.ignored);
  return [
    group([
      canCreate && { label: "新しいファイル…", icon: FilePlus, only: "explorer", run: () => ctx.startCreate(folder, false) },
      canCreate && { label: "新しいフォルダー…", icon: FolderPlus, only: "explorer", run: () => ctx.startCreate(folder, true) },
    ]),
    group(
      value && !value.dir
        ? [
            { label: "新しいタブで開く", icon: ExternalLink, run: () => ctx.openTab(value.path, value.staged) },
            { label: "ファイルタブで開く", icon: ExternalLink, only: "changes", run: () => ctx.openInFilesTab(value.path) },
          ]
        : [],
    ),
    group([
      value?.dir && ctx.onFindInFolder && { label: "フォルダー内を検索", icon: FolderSearch, title: "検索タブで、このフォルダーの中だけを探す", run: () => ctx.onFindInFolder?.(value.path) },
    ]),
    { kind: "paths", paths: [value?.path ?? ""], dir: value?.dir ?? true },
    group(
      value
        ? [
            { label: "名前を変更", icon: Pencil, title: "Enter でも変えられます", run: () => ctx.startRename(value.path) },
            { label: "ゴミ箱に入れる…", icon: Trash2, danger: true, only: "explorer", run: () => ctx.trash([{ path: value.path, dir: value.dir }]) },
          ]
        : [],
    ),
  ];
}

function manyGroups(many: PickedEntry[], ctx: FileMenuContext): FileMenuGroup[] {
  const files = many.filter((n) => !n.dir);
  // 変更の一覧のまとまりごと（ファイルタブでは staged を持たないので、どちらも空）
  const unstaged = many.filter((n) => n.staged === false).map((n) => n.path);
  const staged = many.filter((n) => n.staged === true).map((n) => n.path);
  return [
    group([
      files.length > 0 && {
        label: `新しいタブで開く（${files.length} 件）`,
        icon: ExternalLink,
        run: () => {
          for (const f of files) ctx.openTab(f.path, f.staged);
        },
      },
    ]),
    group([
      unstaged.length > 0 && { label: `ステージする（${unstaged.length} 件）`, icon: Plus, run: () => ctx.runGit("stage", unstaged) },
      staged.length > 0 && { label: `ステージを取り消す（${staged.length} 件）`, icon: Minus, run: () => ctx.runGit("unstage", staged) },
      unstaged.length > 0 && { label: `変更を元に戻す…（${unstaged.length} 件）`, icon: Undo2, danger: true, run: () => ctx.runGit("discard", unstaged) },
    ]),
    { kind: "paths", paths: many.map((n) => n.path), dir: false },
    group([{ label: `ゴミ箱に入れる…（${many.length} 件）`, icon: Trash2, danger: true, only: "explorer", run: () => ctx.trash(many) }]),
  ];
}
