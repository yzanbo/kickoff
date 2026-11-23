import { useState } from "react";
import { useNoteList } from "./store";
import { confirmLeaveNote } from "./noteLeave";
import { NoteView } from "@/features/notes/ui/document/NoteView";
import { openInNoteTab } from "./openNoteFrom";

/**
 * チャットの画面の右の欄・別ウィンドウで開いたノート（ノートのタブの右と同じ。⌘S で保存）。
 * chatId は開いたチャット（見出しのボタン・本文の右クリックで、ノートをそのチャットの入力欄に追加する）。
 * 題名で名前を変えた・HTML のノートのリンクで別のノートへ移ったら、そのパスで開き直す（onRenamed で、開いている側（タブ・別ウィンドウの URL）にも知らせる）
 */
export function SideNote({
  projectId,
  path: opened,
  chatId,
  onRenamed,
  noteTabButton = false,
}: {
  projectId: number;
  path: string;
  chatId: number | null;
  onRenamed?: (path: string) => void;
  /** 見出しに「ノートのタブで開く」を出す（DB クライアントの手順ノートのタブ） */
  noteTabButton?: boolean;
}) {
  const list = useNoteList(projectId);
  const [path, setPath] = useState(opened);
  if (!list.data) return <div className="page muted">{list.error ?? "読み込み中…"}</div>;
  return (
    <div className="side-note">
      <NoteView
        key={path}
        projectId={projectId}
        path={path}
        dir={list.data.dir}
        attachTo={chatId}
        onOpenInNoteTab={noteTabButton ? () => openInNoteTab(projectId, path) : undefined}
        onRenamed={(to) => {
          setPath(to);
          onRenamed?.(to);
        }}
        onOpenNote={(to) =>
          void confirmLeaveNote(projectId, path).then((ok) => {
            if (!ok) return;
            setPath(to);
            onRenamed?.(to);
          })
        }
      />
    </div>
  );
}
