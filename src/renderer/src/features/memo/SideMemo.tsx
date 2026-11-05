import { useMemoList } from "@/stores/memos";
import { MemoView } from "./MemoView";

/** チャットの画面の右の欄・別ウィンドウで開いたメモ（メモのタブの右と同じ。書くのが止まったら自動で保存） */
export function SideMemo({ projectId, path }: { projectId: number; path: string }) {
  const list = useMemoList(projectId);
  if (!list.data) return <div className="page muted">{list.error ?? "読み込み中…"}</div>;
  return (
    <div className="side-memo">
      <MemoView key={path} projectId={projectId} path={path} dir={list.data.dir} />
    </div>
  );
}
