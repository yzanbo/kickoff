import "./TrashTab.css";
import { Trash2 } from "lucide-react";
import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import { useProjectTrash } from "@/features/trash/ui/stores/trash";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { useTicker } from "@/foundation/ui/hooks/useTicker";
import { EmptyTrashButton, TrashRow } from "./TrashRow";

/**
 * プロジェクトの「ゴミ箱」タブ。Kickoff のゴミ箱に入れたもの（AI の kickoff-trash・ファイル / ノートの「ゴミ箱に入れる」・
 * チャットの削除）を新しい順に並べ、何を・いつ・誰が消したか・消えるまでの残り・大きさと「元に戻す」「完全に消す」を出す。3 日を待たずに全部を消す
 * 「ゴミ箱を空にする」も見出しに置く（repoPath はプロジェクトのフォルダ。projects の画面が渡す）
 */
export function TrashTab({ projectId, repoPath }: { projectId: number; repoPath: string }) {
  const { data, error, loaded } = useProjectTrash(projectId);
  // 残りの時間を描き直す
  useTicker(60_000);
  const items = data ?? [];
  return (
    <div className="trash-tab">
      <header className="trash-head">
        <Trash2 size={16} aria-hidden />
        <h2>ゴミ箱</h2>
        <span className="muted small">{`消したものを ${TRASH_KEEP_DAYS} 日取っておきます。${TRASH_KEEP_DAYS} 日たつと本当に消えます（待たずに完全に消すこともできます。OS のゴミ箱とは別です）。`}</span>
        <span className="spacer" />
        <EmptyTrashButton items={items} label="ゴミ箱を空にする" title={`ゴミ箱の ${items.length} 件を完全に消しますか？`} />
      </header>
      <div className="trash-body">
        <ErrorText message={error} />
        {loaded && items.length === 0 ? (
          <EmptyState icon={Trash2} title="ゴミ箱は空です">
            {`AI が消したファイル（rm の代わりの kickoff-trash）・ファイルタブやノートの「ゴミ箱に入れる」・削除したチャット・消したワークツリーの控え（取り込んでいないコミット・途中の変更）が、ここに ${TRASH_KEEP_DAYS} 日入ります。`}
          </EmptyState>
        ) : (
          <ul className="trash-list">
            {items.map((item) => (
              <TrashRow key={item.id} item={item} repoPath={repoPath} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
