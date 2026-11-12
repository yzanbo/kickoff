import { Pin } from "lucide-react";
import type { DbConnection } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { dbTreePins } from "@/lib/storageKeys";
import { useDbClient } from "./dbClientContext";
import { objectPathLabel } from "./dbFormat";
import { pinsOf } from "./dbPins";
import { TreeRow, type TreeOpen } from "./DbTreeRow";

/** 接続のすぐ下に並べる、ピン留めしたテーブル・ビュー（押すと仮のタブ・ダブルクリックで固定。右クリックはテーブルのメニュー） */
export function PinnedObjects({ connection: c, tree }: { connection: DbConnection; tree: TreeOpen }) {
  const client = useDbClient();
  const [ids] = useSetting(dbTreePins(String(client.projectId)));
  const pins = pinsOf(ids, c.id);
  // 場所（DB・スキーマ）は、ピンの場所が 2 つ以上あるときだけ添える（SQLite の main だけなどは出さない）
  const manyPlaces = new Set(pins.map((p) => objectPathLabel(p.path))).size > 1;
  return (
    <>
      {pins.map((p) => (
        <TreeRow
          key={`${objectPathLabel(p.path)}:${p.kind}:${p.name}`}
          depth={1}
          icon={<Pin size={12} aria-hidden className="db-tree-pin" />}
          label={p.name}
          note={manyPlaces ? objectPathLabel(p.path) || undefined : undefined}
          title={`${objectPathLabel(p.path, p.name)}（ピン留め）`}
          className="db-tree-object db-tree-pinned"
          onOpen={() => client.openTable(c, p.path, p.name, p.kind, undefined, true)}
          onPin={() => client.openTable(c, p.path, p.name, p.kind)}
          onContextMenu={(e) => tree.menu(e, { connection: c, path: p.path, table: { name: p.name, kind: p.kind } })}
        />
      ))}
    </>
  );
}
