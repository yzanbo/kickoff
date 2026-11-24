import "./TrashMarkRows.css";
import { useState } from "react";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import type { TrashMark } from "@shared/trash/marks";
import { ApiError } from "@/foundation/ui/api/http";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { errorText, useQuery } from "@/foundation/ui/query";
import { trashApi } from "./api";
import { restoreFromTrash } from "./trashActions";
import { remainingText } from "./trashText";

/**
 * 会話の中のコマンドの出力に出た kickoff-trash の印を 1 行ずつ出し、その場で「元に戻す」。
 * まだゴミ箱にあるかは、呼び出しを開いたとき（active）に 1 回だけ聞く（閉じたままの呼び出しでは聞かない。404 以外の失敗は文と「もう一度」）
 */
export function TrashMarkRows({ marks, active, rel }: { marks: TrashMark[]; active: boolean; rel: (s: string) => string }) {
  if (marks.length === 0) return null;
  return (
    <ul className="trash-marks" aria-label="ゴミ箱に入れたもの">
      {marks.map((mark) => (
        <TrashMarkRow key={mark.id} mark={mark} active={active} rel={rel} />
      ))}
    </ul>
  );
}

function TrashMarkRow({ mark, active, rel }: { mark: TrashMark; active: boolean; rel: (s: string) => string }) {
  // この画面で戻した
  const [restored, setRestored] = useState(false);
  const { busy, run } = useAction();
  const label = mark.origin.split("/").pop() || mark.origin;
  const query = useQuery(["TrashMarkRow", mark.id], () => trashApi("GET /api/trash/:itemId", { params: { itemId: mark.id } }), { enabled: active && !restored });
  const gone = !restored && query.error instanceof ApiError && query.error.status === 404;
  const failed = !restored && !gone && query.error ? errorText(query.error) : null;
  const item = restored ? undefined : query.data;
  return (
    <li className="trash-mark">
      <Trash2 size={13} aria-hidden className="trash-mark-icon" />
      <span className="trash-mark-text">
        ゴミ箱に入れました: <span className="trash-mark-path">{rel(mark.origin)}</span>
      </span>
      {item && <span className="trash-mark-note muted">{remainingText(item.expires_at)}</span>}
      {gone && <span className="trash-mark-note muted">{`もうゴミ箱にありません（戻したか、${TRASH_KEEP_DAYS} 日たって消えました）`}</span>}
      {failed && (
        <>
          <span className="trash-mark-note muted">ゴミ箱にあるか確かめられませんでした: {failed}</span>
          <button type="button" className="btn" data-size="sm" onClick={() => void query.reload()}>
            もう一度
          </button>
        </>
      )}
      {restored ? (
        <span className="trash-mark-note trash-mark-done">
          <Check size={13} aria-hidden />
          戻しました
        </span>
      ) : (
        !gone && (
          <button
            type="button"
            className="btn"
            data-size="sm"
            disabled={busy !== null}
            onClick={() => void run("restore", async () => (await restoreFromTrash({ id: mark.id, label })) && setRestored(true))}
          >
            <RotateCcw size={13} aria-hidden />
            元に戻す
          </button>
        )
      )}
    </li>
  );
}
