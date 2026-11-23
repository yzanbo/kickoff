import { AppWindow, Copy, ExternalLink, FolderOpen } from "lucide-react";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { menuGroups } from "@/foundation/ui/kit/menuParts";
import { lineLocation } from "@/foundation/ui/lib/pathCopy";
import { canOpenExternal, openExternal } from "./native";

const copy = (text: string) => void navigator.clipboard.writeText(text);

/**
 * パスの右クリックの項目（ファイルの木・変更の一覧・検索の結果・チャットの中のファイルで同じ）。組の間に線を入れて返す:
 * - 外のアプリ（Mac のアプリだけ。パスが 1 つのとき）: VS Code で開く（line ならその行へ）・既定のアプリで開く・Finder で表示（フォルダは Finder だけ）
 * - コピー: 「パスをコピー」= root から見たパス（line があれば「パスと行番号をコピー」）・「絶対パスをコピー」= フルパス。いくつかなら 1 行に 1 つずつ。
 *   パスが ""（root そのもの）なら絶対パスだけ
 */
export function PathMenuItems({ root, paths, line, dir = false }: { root: string; paths: readonly string[]; line?: number; dir?: boolean }) {
  const absolute = (path: string) => (path ? `${root}/${path}` : root);
  const one = paths.length === 1 ? paths[0] : null;
  const count = one === null ? `（${paths.length} 件）` : "";
  const external =
    one !== null && canOpenExternal()
      ? [
          !dir && (
            <MenuItem key="vscode" onSelect={() => void openExternal({ kind: "vscode", path: absolute(one), line })}>
              <ExternalLink size={14} aria-hidden /> VS Code で開く
            </MenuItem>
          ),
          !dir && (
            <MenuItem key="path" onSelect={() => void openExternal({ kind: "path", path: absolute(one) })}>
              <AppWindow size={14} aria-hidden /> 既定のアプリで開く
            </MenuItem>
          ),
          <MenuItem key="reveal" onSelect={() => void openExternal({ kind: "reveal", path: absolute(one) })}>
            <FolderOpen size={14} aria-hidden /> Finder で表示
          </MenuItem>,
        ]
      : [];
  const copies = [
    one !== "" && (
      <MenuItem key="relative" title={`作業場所のフォルダーから見たパスを${one === null ? " 1 行に 1 つずつ" : ""}コピーします`} onSelect={() => copy(one !== null && line ? lineLocation(one, { from: line, to: line }) : paths.join("\n"))}>
        <Copy size={14} aria-hidden /> {one !== null && line ? "パスと行番号をコピー" : `パスをコピー${count}`}
      </MenuItem>
    ),
    <MenuItem key="absolute" title={`フルパスを${one === null ? " 1 行に 1 つずつ" : ""}コピーします`} onSelect={() => copy(paths.map(absolute).join("\n"))}>
      <Copy size={14} aria-hidden /> 絶対パスをコピー{count}
    </MenuItem>,
  ];
  return <>{menuGroups([external, copies])}</>;
}
