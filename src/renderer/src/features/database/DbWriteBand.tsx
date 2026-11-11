import { Lock, TriangleAlert } from "lucide-react";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/types";

/**
 * 「書き込む」の間の上の赤い帯（SQL のタブ・テーブルのタブ）。what: 何をするたびに確かめるか（「流す」「保存する」）。
 * blocked: いまは戻せない理由（トランザクションの途中など。あれば押せない）
 */
export function DbWriteBand({ connection, what, blocked, onRevert }: { connection: DbConnection; what: string; blocked: string | null; onRevert: () => void }) {
  return (
    <div className="db-write-band" role="alert">
      <TriangleAlert size={14} aria-hidden />
      <span className="db-write-text">
        書き込めます（{DB_ENVIRONMENT_LABELS[connection.environment]}）。{what}たびに確かめます。10 分何もしなければ読み取り専用に戻ります
      </span>
      <button type="button" className="btn btn-sm" disabled={blocked !== null} onClick={onRevert} data-tip={blocked ?? "このタブを読み取り専用に戻す"}>
        <Lock size={12} aria-hidden /> 読み取り専用に戻す
      </button>
    </div>
  );
}
