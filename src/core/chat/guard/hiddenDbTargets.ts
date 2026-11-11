import path from "node:path";
import type { DbConnection } from "@shared/types";
import { expandHome } from "../../system/paths.js";
import type { HiddenDbTarget } from "./hiddenDb.js";

/**
 * プロジェクトの接続のうち「見せない」もののつなぎ先。SQLite のファイルは作業場所と本体の両方で解き、
 * ファイル名だけでも探す（見せる接続に同じファイル名があれば、取り違えないよう名前だけでは探さない）
 */
export function hiddenDbTargets(connections: DbConnection[], dirs: string[]): HiddenDbTarget[] {
  const visibleNames = new Set(connections.filter((c) => c.ai_access !== "none" && c.file_path).map((c) => path.basename(c.file_path ?? "")));
  return connections
    .filter((c) => c.ai_access === "none")
    .map((c) => {
      let file: HiddenDbTarget["file"] = null;
      if (c.engine === "sqlite" && c.file_path) {
        const expanded = expandHome(c.file_path);
        const absolute = [...new Set(path.isAbsolute(expanded) ? [path.resolve(expanded)] : dirs.map((d) => path.resolve(d, expanded)))];
        const base = path.basename(expanded);
        file = { names: [...absolute, ...(c.file_path !== base ? [c.file_path] : []), ...(visibleNames.has(base) ? [] : [base])], absolute };
      }
      return { name: c.name, engine: c.engine, host: c.engine === "sqlite" ? null : c.host, port: c.port, file };
    });
}
