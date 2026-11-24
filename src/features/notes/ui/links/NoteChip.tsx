import "./NoteChip.css";
import { StickyNote } from "lucide-react";
import { canPopout } from "@/foundation/ui/navigation/popout";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/notes/ui/storage";
import { useNoteList } from "@/features/notes/ui/store";
import { usePopover } from "@/foundation/ui/kit/Popover";
import { ChipWord, ComposerChip, DefaultOpenPlace, useMainChat } from "@/features/chat/ui";
import { attachNoteToChat } from "./attachNote";
import { openNoteFromChat } from "@/features/notes/ui/openNote";
import { useDraftSide } from "@/features/chatPanel/ui";
import { notesApi } from "@/features/notes/ui/api";
import { reportFailure } from "@/foundation/ui/kit/ask";
import type { ComposerPillProps } from "@/features/composer/ui";
import { useProjects } from "@/features/projects/ui";
import { COMMON_NOTES_LABEL, noteOwnerName, useCommonNotes } from "@/features/notes/ui/commonNotes";
import { NoteChipSection } from "./NoteChipSection";

/**
 * 入力欄の上の「ノート」（指示の履歴・子チャットと同じピルの列）。押すと、いちばん上に共通のノート、その下にこのプロジェクトのノートのフォルダの木（ノートのタブと同じ並び・同じ開いているフォルダ。
 * ノートの入っていないフォルダは出さない）を欄ごとに出し（NoteChipSection）、ノートの行を押すと設定の開き方（右の欄 / 別ウィンドウ）で開く。共通のノートはどのプロジェクトのチャットにも足せる。
 * 行の右のボタンで、ノートを開かずにこのチャットの入力欄に追加する（押した時点の写しの札。一覧は閉じず、続けていくつも足せる）・設定によらずその場所に開ける。一覧の上で、行を押したときの開き方（設定）を変えられる。
 * 行をドラッグしてフォルダ（欄の空いている所なら根）へ落とすと動かす（ほかの欄へはノートのチャットごと移す。ノートのタブの木と同じ）。
 * どちらにもノートがなければ出さない。
 * 送る前のチャット（新しいチャット・新しい子チャット）では chatId が null で、「このチャットに追加」は onAttach でその入力欄に足す。
 * 開く場所は、新しいチャットならそのタブの右の欄（useDraftSide）、新しい子チャットなら親の右の欄（useMainChat）
 */
export function NoteChip({ projectId, chatId, onAttach }: { projectId: number; chatId: number | null; onAttach?: (projectId: number, path: string) => void }) {
  const common = useCommonNotes();
  const commonId = common.state === "ready" ? common.projectId : null;
  const list = useNoteList(projectId);
  const commonList = useNoteList(commonId ?? projectId, commonId !== null);
  const popover = usePopover();
  const mainChat = useMainChat();
  // 送る前の新しいチャットなら、そのタブの右の欄
  const draftSide = useDraftSide();
  const [openIn, setOpenIn] = useSetting(storage.settings.openIn);
  const projectName = noteOwnerName(useProjects().projectsById.get(projectId));
  const hasNotes = (entries: readonly { dir: boolean }[] | undefined) => Boolean(entries?.some((e) => !e.dir));
  if (!hasNotes(list.data?.entries) && !(commonId !== null && hasNotes(commonList.data?.entries))) return null;
  // 別ウィンドウは Mac のアプリだけ
  const places = canPopout() ? (["side", "window"] as const) : (["side"] as const);
  const open = (noteProjectId: number, path: string, place?: "side" | "window") => {
    popover.close();
    // 右の欄・別ウィンドウの中（ノートのタブの中のノートのチャットなど）では、その右の欄を持つチャットの右の欄に新しいタブで開く
    // （ノートのチャット自身の右の欄を探すと、ノートのチャットをチャットのパネルに開いてしまう）
    openNoteFromChat({ projectId: noteProjectId, path, chatId: mainChat ?? chatId, place, draftSide });
  };
  const attach = (noteProjectId: number, path: string) => {
    // 続けていくつも足せるよう、一覧は閉じない
    if (chatId !== null) attachNoteToChat(chatId, noteProjectId, path);
    else onAttach?.(noteProjectId, path);
  };
  return (
    <ComposerChip
      popover={popover}
      chip={
        <>
          <StickyNote size={14} className="chip-icon" aria-hidden />
          <ChipWord>ノート</ChipWord>
        </>
      }
      title="共通のノートとこのプロジェクトのノート（ノートのタブと同じフォルダの木。行をドラッグしてフォルダへ動かせる）"
      label="ノート"
      className="note-chip-popover"
    >
      {() => (
        <>
          {places.length > 1 && (
            <div className="note-chip-head">
              <DefaultOpenPlace places={places} value={openIn} onChange={setOpenIn} inline />
            </div>
          )}
          {commonId !== null && <NoteChipSection projectId={commonId} title={COMMON_NOTES_LABEL} places={places} onOpen={open} onAttach={attach} />}
          <NoteChipSection projectId={projectId} title={projectName || "このプロジェクト"} places={places} onOpen={open} onAttach={attach} />
          <button
            type="button"
            className="note-chip-row more"
            onClick={() => {
              popover.close();
              openTarget({ kind: "projectView", projectId: projectId, view: "notes" });
            }}
          >
            ノートのタブを開く
          </button>
        </>
      )}
    </ComposerChip>
  );
}

/** 入力欄の差し込み（composerSlots の pill）: ノートのピル。送る前の欄では、選んだノートの写しを attach で下書きに足す */
export function ComposerNotePill({ projectId, chatId, attach }: ComposerPillProps) {
  return (
    <NoteChip
      projectId={projectId}
      chatId={chatId}
      onAttach={attach && ((noteProjectId, path) => void notesApi("POST /api/projects/:projectId/note/snapshot", { params: { projectId: noteProjectId }, body: { path } }).then(attach, reportFailure("ノートを添付できませんでした")))}
    />
  );
}
