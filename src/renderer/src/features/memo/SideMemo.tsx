import { useState } from "react";
import { useMemoList } from "@/stores/memos";
import { confirmLeaveMemo } from "./memoGuards";
import { MemoView } from "./MemoView";

/**
 * チャットの画面の右の欄・別ウィンドウで開いたメモ（メモのタブの右と同じ。⌘S で保存）。
 * 題名で名前を変えた・HTML のメモのリンクで別のメモへ移ったら、そのパスで開き直す（onRenamed で、開いている側（タブ・別ウィンドウの URL）にも知らせる）
 */
export function SideMemo({ projectId, path: opened, onRenamed }: { projectId: number; path: string; onRenamed?: (path: string) => void }) {
  const list = useMemoList(projectId);
  const [path, setPath] = useState(opened);
  if (!list.data) return <div className="page muted">{list.error ?? "読み込み中…"}</div>;
  return (
    <div className="side-memo">
      <MemoView
        key={path}
        projectId={projectId}
        path={path}
        dir={list.data.dir}
        onRenamed={(to) => {
          setPath(to);
          onRenamed?.(to);
        }}
        onOpenMemo={(to) =>
          void confirmLeaveMemo(projectId, path).then((ok) => {
            if (!ok) return;
            setPath(to);
            onRenamed?.(to);
          })
        }
      />
    </div>
  );
}
