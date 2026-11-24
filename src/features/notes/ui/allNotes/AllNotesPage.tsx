import "./AllNotesPage.css";
import { Globe, StickyNote } from "lucide-react";
import { UnsavedSurfaceContext } from "@/foundation/ui/document/unsaved";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";
import { WindowHeaderContent } from "@/foundation/ui/shell/WindowHeaderContent";
import { Panel, type PanelFrame } from "@/features/panel/ui";
import { COMMON_NOTES_EMPTY_HINT, COMMON_NOTES_LABEL } from "@/features/notes/ui/commonNotes";
import { NoteSection, NoteSectionNotice } from "@/features/notes/ui/tree/NoteSection";
import { NoteSplit } from "@/features/notes/ui/tree/NoteSplit";
import { ALL_NOTES_SURFACE } from "./allNotesLeave";
import { ALL_NOTES_FOLD_PLACE, allNotesFoldKey, allNotesMoveTargets } from "./allNotesModel";
import { useAllNotesPage } from "./useAllNotesPage";

/** 右の欄は画面そのものなので、閉じる・幅を変えるなどの道具を出さない */
const FIXED_FRAME: PanelFrame = { fixed: true };

/**
 * 全ノート（左のサイドバーの「全ノート」）: いちばん上に「共通のノート」（どのプロジェクトにも属さないノート）、その下にプロジェクトごとのノートの欄を
 * サイドバーと同じ順に並べ（初めはプロジェクトの欄を閉じ、開いた欄だけが一覧を読む）、右に開いたノートをタブで並べる（ノートのタブと同じ部品）。
 * 欄の間はドラッグ・右クリックの「〜へ移す」で、ノートのチャットごと移せる。いまのプロジェクトはないので、周り（右サイドバー・下のパネル・⌘N）は全プロジェクトの画面と同じ扱い
 */
export function AllNotesPage() {
  const t = useAllNotesPage();
  const { common, panel, sections } = t;
  return (
    <div className="page page-wide page-board all-notes-page">
      <header className="page-header project-header">
        <WindowHeaderContent>
          <div className="project-title-row">
            <h1 className="all-notes-title">
              <StickyNote size={16} aria-hidden /> 全ノート
            </h1>
          </div>
        </WindowHeaderContent>
      </header>
      {/* 中のノートの書きかけはこの画面の名前で出す（離れる前に allNotesLeave が聞く） */}
      <UnsavedSurfaceContext value={ALL_NOTES_SURFACE}>
        <div className="all-notes-body">
          <NoteSplit
            refreshing={t.refreshing}
            onRefresh={t.refresh}
            query={t.query}
            onQuery={t.setQuery}
            main={
              panel.tabs.length > 0 ? (
                <Panel panel={panel} frame={FIXED_FRAME} />
              ) : (
                <EmptyState icon={StickyNote} title="ノートを選んでください">
                  <p>左の欄でノートを押すと、ここに開きます（⌘クリックで新しいタブ）。共通のノートはどのプロジェクトにも属さないノートで、どのチャットの AI からも読み書きできます。プロジェクトの欄は、開くとノートが並びます。</p>
                </EmptyState>
              )
            }
          >
            {common.state === "unavailable" && (
              <NoteSectionNotice title={COMMON_NOTES_LABEL} icon={Globe} fold={{ place: ALL_NOTES_FOLD_PLACE, key: allNotesFoldKey(0, true) }} message={common.message} />
            )}
            {sections.map((s) => (
              <NoteSection
                key={s.projectId}
                projectId={s.projectId}
                title={s.title}
                icon={s.common ? Globe : StickyNote}
                fold={{ place: ALL_NOTES_FOLD_PLACE, key: s.foldKey, defaultOpen: s.defaultOpen }}
                shownPath={t.shownPathIn(s.projectId)}
                onOpen={t.open}
                query={t.query}
                active={t.activeSection === s.projectId}
                onActivate={() => t.setActiveSection(s.projectId)}
                onCreated={t.onCreated}
                moveTargets={allNotesMoveTargets(sections, s.projectId)}
                emptyHint={s.common ? COMMON_NOTES_EMPTY_HINT : "まだノートはありません。見出しの ＋ から作れます。"}
                showTrash={s.common}
              />
            ))}
          </NoteSplit>
        </div>
      </UnsavedSurfaceContext>
    </div>
  );
}
