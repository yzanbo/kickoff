import "./NoteTab.css";
import { FileCode2, FilePlus, FolderOpen, Globe, StickyNote } from "lucide-react";
import { cx } from "@/foundation/ui/lib/cx";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";
import { ListRail } from "@/foundation/ui/kit/ListRail";
import { SearchField } from "@/foundation/ui/kit/SearchField";
import { canOpenExternal } from "@/foundation/ui/external/native";
import { Panel, type PanelFrame } from "@/features/panel/ui";
import { useProjects } from "@/features/projects/ui";
import { COMMON_NOTES_LABEL, noteOwnerName } from "@/features/notes/ui/commonNotes";
import { NoteListHead } from "./NoteListHead";
import { NoteSection, NoteSectionNotice } from "./NoteSection";
import type { NoteSectionFold } from "./useNoteSection";
import { useNoteTab, type NoteTabProps } from "./useNoteTab";

/** 右の欄は画面そのものなので、閉じる・幅を変えるなどの道具を出さない */
const FIXED_FRAME: PanelFrame = { fixed: true };

/** 共通のノートの欄の開閉（どのプロジェクトのノートのタブ・右サイドバーでも同じ覚え） */
const COMMON_FOLD: NoteSectionFold = { place: "notes", key: "common" };

/**
 * プロジェクトの「ノート」タブ（左にノートの欄を並べた一覧、右に開いたノート）。右サイドバーのノートも同じ部品。左の一覧は隠せる（listHidden。隠している間は左端の細い帯 ListRail に「一覧を表示」）。
 * 一覧のいちばん上に折りたためる「共通のノート」の欄（どのプロジェクトにも属さないノート。見えないプロジェクトのノート）、その下にこのプロジェクトの欄（NoteSection。欄ごとに選択・作る・名前の変更を持つ）。
 * ノートはプロジェクトの外（設定の親フォルダの下の、プロジェクトごとのフォルダ）の Markdown。openNote は URL の ?note= で来たこのプロジェクトのノート（チャットの「ノートに追加」・⌘K から。開いたら URL から外す）、
 * openNoteLine はそのノートで移る行（⌘K の「ノート内の文言」）。右は開いたノートをタブで並べるパネル（notes。チャットのパネルと同じく、タブのドラッグで上下・左右に分けられる）で、
 * どの欄のノートもここに開く（タブはノートのプロジェクトを持つ）。欄の間はドラッグ・右クリックで、ノートのチャットごと移せる。最後に表示したこのプロジェクトのノートは storage.ts の selected に覚え、次に開いたときに開き直す
 */
export function NoteTab(props: NoteTabProps) {
  const { projectId } = props;
  // hook が返した ref は分けて受ける（まとめた物から読むと、描く中で ref を読むとみなされる）
  const { widthPaneRef, ...t } = useNoteTab(props);
  const { common, list, panel } = t;
  const projectName = noteOwnerName(useProjects().projectsById.get(projectId));
  // 欄に共通で渡すもの（開く先・探す文・選んでいる欄）
  const sectionOf = (id: number) => ({
    shownPath: t.shownPathIn(id),
    onOpen: t.open,
    query: t.query,
    active: t.activeSection === id,
    onActivate: () => t.setActiveSection(id),
    onCreated: t.onCreated,
  });
  return (
    <div className={cx("changes", "note-tab", t.width.resizing && "resizing")}>
      {t.listHidden ? (
        // 一覧を隠している間は、左端の細い帯に戻すボタンだけを置く（ノートを開いていなくても戻せるように）
        <ListRail label="ノートの一覧を表示" onShow={() => t.setListHidden(false)} />
      ) : (
        <>
          <aside ref={widthPaneRef} className={cx("changes-list", "note-list")} style={{ width: t.width.size }} aria-label="ノート">
            <NoteListHead refreshing={list.loading} onRefresh={t.refresh} onHide={() => t.setListHidden(true)} />
            <SearchField className="note-search" value={t.query} onChange={t.setQuery} placeholder="ノートを名前で探す" label="ノートを名前で探す" />
            {/* 見出しと探す欄は残し、欄だけを流す。いちばん上に共通のノート（どのプロジェクトからも同じ中身）、その下にこのプロジェクト */}
            <div className="changes-scroll note-sections">
              {common.state === "unavailable" && <NoteSectionNotice title={COMMON_NOTES_LABEL} icon={Globe} fold={COMMON_FOLD} message={common.message} />}
              {common.state === "ready" && (
                <NoteSection
                  {...sectionOf(common.projectId)}
                  projectId={common.projectId}
                  title={COMMON_NOTES_LABEL}
                  icon={Globe}
                  fold={COMMON_FOLD}
                  moveTargets={[{ projectId, label: "このプロジェクトのノートへ移す" }]}
                  emptyHint="共通のノートはまだありません。見出しの ＋ から作ると、どのプロジェクトのノートのタブからも開けます（どのチャットの AI からも読み書きできます）。"
                />
              )}
              <NoteSection
                {...sectionOf(projectId)}
                projectId={projectId}
                title={projectName || "このプロジェクト"}
                icon={StickyNote}
                fold={{ place: "notes", key: `p${projectId}` }}
                moveTargets={common.state === "ready" ? [{ projectId: common.projectId, label: "共通のノートへ移す" }] : []}
                emptyHint="まだノートはありません。見出しの ＋ から作るか、チャットの文を右クリックして「ノートに追加」で作れます。"
                renameRequest={t.renameRequest}
                onRenameRequestTaken={() => t.setRenameRequest(null)}
              />
            </div>
          </aside>
          <div className="pane-resizer" aria-label="一覧の幅を変える" {...t.width.handle} />
        </>
      )}
      <div className="changes-diff note-main">
        {panel.tabs.length > 0 ? (
          <Panel panel={panel} frame={FIXED_FRAME} />
        ) : (
          list.data && (
            <EmptyState
              icon={StickyNote}
              title={t.hasTree ? "ノートを選んでください" : "ノートはまだありません"}
              actions={
                <>
                  <button className="btn btn-primary" onClick={() => void t.emptyActions.createNote("")}>
                    <FilePlus size={14} aria-hidden /> 新しいノート
                  </button>
                  <button className="btn" onClick={() => void t.emptyActions.createNote("", "html")}>
                    <FileCode2 size={14} aria-hidden /> 新しい HTML ノート
                  </button>
                  {canOpenExternal() && list.data.exists && (
                    <button className="btn" onClick={() => void t.reveal()}>
                      <FolderOpen size={14} aria-hidden /> Finder で開く
                    </button>
                  )}
                </>
              }
            >
              <p>このプロジェクトのノートは、プロジェクトの外のフォルダに Markdown（HTML のノートは HTML）で保存します。チャットの文を右クリックして「ノートに追加」でも作れます（AI に要約させることもできます）。</p>
              <p className="muted small note-dir" title={list.data.dir}>
                保存先: {list.data.dir}
              </p>
            </EmptyState>
          )
        )}
      </div>
    </div>
  );
}
