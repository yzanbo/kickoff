import { useEffect, useState } from "react";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import type { TrashItem } from "@shared/types";
import type { TrashMark } from "@shared/trash/marks";
import { api, ApiError } from "@/api";
import { useAction } from "@/hooks/useAction";
import { restoreFromTrash } from "./trashActions";
import { remainingText } from "./trashText";

/** 1 件の様子（読んでいる・ゴミ箱にある・もうない・この画面で戻した） */
type MarkState = { kind: "loading" } | { kind: "in"; item: TrashItem } | { kind: "gone" } | { kind: "restored" };

/**
 * 会話の中のコマンドの出力に出た kickoff-trash の印（メモの仕様書「ファイル削除」の Q6 ③）を 1 行ずつ出し、その場で「元に戻す」。
 * まだゴミ箱にあるかは、呼び出しを開いたとき（active）に 1 回だけ聞く（閉じたままの呼び出しでは聞かない）
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
  const [state, setState] = useState<MarkState>({ kind: "loading" });
  const { busy, run } = useAction();
  const label = mark.origin.split("/").pop() || mark.origin;
  useEffect(() => {
    if (!active || state.kind !== "loading") return;
    let alive = true;
    api.trashItem(mark.id).then(
      (item) => alive && setState({ kind: "in", item }),
      (e: unknown) => alive && setState(e instanceof ApiError && e.status === 404 ? { kind: "gone" } : { kind: "loading" }),
    );
    return () => {
      alive = false;
    };
  }, [active, mark.id, state.kind]);
  return (
    <li className="trash-mark">
      <Trash2 size={13} aria-hidden className="trash-mark-icon" />
      <span className="trash-mark-text">
        ゴミ箱に入れました: <span className="trash-mark-path">{rel(mark.origin)}</span>
      </span>
      {state.kind === "in" && <span className="trash-mark-note muted">{remainingText(state.item.expires_at)}</span>}
      {state.kind === "gone" && <span className="trash-mark-note muted">もうゴミ箱にありません（戻したか、3 日たって消えました）</span>}
      {state.kind === "restored" ? (
        <span className="trash-mark-note trash-mark-done">
          <Check size={13} aria-hidden />
          戻しました
        </span>
      ) : (
        state.kind !== "gone" && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy !== null}
            onClick={() => void run("restore", async () => (await restoreFromTrash({ id: mark.id, label })) && setState({ kind: "restored" }))}
          >
            <RotateCcw size={13} aria-hidden />
            元に戻す
          </button>
        )
      )}
    </li>
  );
}
