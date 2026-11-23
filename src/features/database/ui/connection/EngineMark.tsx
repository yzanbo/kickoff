import { DB_ENGINE_LABELS, type DbEngine } from "@shared/database/types";

/** DB の種類の短い印（商標のロゴは使わない） */
const ENGINE_MARKS: Record<DbEngine, string> = { postgres: "Pg", mysql: "My", sqlite: "Lt" };

/**
 * 接続の頭の種類の印（木・ホーム・メニュー・SQL のタブの接続・種類のタイル）。
 * name: 読み上げる名前を付ける（印だけで種類を伝える所）・hidden: 読み上げない（隣に名前がある所）・省けば印の文字のまま
 */
export function EngineMark({ engine, read }: { engine: DbEngine; read?: "name" | "hidden" }) {
  return (
    <span className="db-engine-mark" aria-label={read === "name" ? DB_ENGINE_LABELS[engine] : undefined} aria-hidden={read === "hidden" ? true : undefined}>
      {ENGINE_MARKS[engine]}
    </span>
  );
}
