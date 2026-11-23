// ゴミ箱の種類 file（ファイル・フォルダ。ノートも）の行の描き方
import { File, Folder } from "lucide-react";
import type { TrashKindView } from "./points";

export const fileTrashKind: TrashKindView = { kind: "file", icon: (item) => (item.is_dir ? Folder : File) };
