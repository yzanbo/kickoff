import { createElement } from "react";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { menuGroups } from "@/foundation/ui/kit/menuParts";
import { PathMenuItems } from "./PathMenuItems";
import { fileMenuItems, fileMenuLabel, type FileMenuContext } from "./fileMenuItems";
import type { FileOps } from "./useFileOps";

/** ファイルの木・変更の一覧の右クリックのメニュー（項目は fileMenuItems、外のアプリとパスのコピーは土台の PathMenuItems） */
export function FileTreeMenu({ ops, root, ...ctx }: { ops: FileOps; root: string } & Omit<FileMenuContext, "startCreate" | "startRename" | "trash" | "runGit">) {
  if (!ops.menu) return null;
  const target = ops.menu.value;
  const groups = fileMenuItems(target, {
    ...ctx,
    startCreate: ops.create.start,
    startRename: ops.rename.start,
    trash: (entries) => void ops.trash(entries),
    runGit: (action, paths) => void ops.runGit(action, paths),
  });
  return (
    <PopupMenu at={ops.menu.at} label={fileMenuLabel(target)} onClose={ops.closeMenu}>
      {menuGroups(
        groups.map((g) =>
          g.kind === "paths"
            ? [<PathMenuItems key="paths" root={root} paths={g.paths} dir={g.dir} />]
            : g.items.map((item) => (
                <MenuItem key={item.label} title={item.title} danger={item.danger} onSelect={item.run}>
                  {createElement(item.icon, { size: 14, "aria-hidden": true })} {item.label}
                </MenuItem>
              )),
        ),
      )}
    </PopupMenu>
  );
}
