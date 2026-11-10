import { SquarePen } from "lucide-react";
import { useState } from "react";
import { cx } from "@/lib/cx";
import { useProjects } from "@/stores/projects";
import { PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { openDraft, type PanelDraft } from "@/features/panel/state/panelDrafts";
import { NEW_CHAT_TITLE } from "@/features/chat/chatTitle";
import { DraftMenuItems, DraftSplitItems, DraftTitleInput } from "@/features/chat/DraftMenuItems";
import { ProjectChip } from "@/features/project/ProjectChip";

/**
 * 列・グループに出す、送る前の新しいチャット（パネル・チャット欄で入力中）の下書き（押すとその欄で開き、表示中なら選択中に見せる。
 * 欄が画面になければ、その画面へ移ってから開く）。showProject: プロジェクトのバッジを付ける（いくつかのプロジェクトの下書きが並ぶ全プロジェクトのボード）
 */
export function DraftCards({ drafts, showProject = false }: { drafts: readonly PanelDraft[]; showProject?: boolean }) {
  const { projectName } = useProjects();
  return drafts.map((d) => <DraftCard key={`${d.panel}:${d.key}`} draft={d} project={showProject ? { id: d.projectId, name: projectName(d.projectId) } : undefined} />);
}

/**
 * 下書きのカード。名前（付けていなければ、書いている途中の文があれば「書きかけ」）と、書いている途中の文の初めの数行を出す。
 * 押すとそのタブを表示し、右クリックはチャットのカードと同じ並びの DraftMenuItems（名前の変更はカードの名前を入力欄にする）
 */
function DraftCard({
  draft,
  project,
}: {
  draft: PanelDraft;
  /** どのプロジェクトの下書きか（全プロジェクトのボードだけ） */
  project?: { id: number; name: string };
}) {
  const written = draft.text.trim();
  const menu = useContextMenu();
  const [renaming, setRenaming] = useState(false);
  const title = draft.title ?? (written ? "書きかけ" : NEW_CHAT_TITLE);
  const head = (
    <span className="draft-card-head">
      <SquarePen size={13} aria-hidden />
      {renaming ? <DraftTitleInput draft={draft} onDone={() => setRenaming(false)} /> : title}
      {project && <ProjectChip id={project.id} name={project.name} />}
    </span>
  );
  return (
    <>
      {renaming ? (
        // 名前を変えている間は押しても開かない（入力欄の文字を選べるように）
        <div className={cx("draft-card", draft.showing && "selected")}>
          {head}
          {written && <span className="draft-card-text">{written}</span>}
        </div>
      ) : (
        <button
          type="button"
          className={cx("draft-card", draft.showing && "selected")}
          title={project ? `プロジェクト「${project.name}」で入力中の新しいチャット（押すと開きます。右クリックで名前の変更・削除など）` : "右側で入力中の新しいチャット（右クリックで名前の変更・削除など）"}
          onClick={() => openDraft(draft)}
          onContextMenu={menu.open}
        >
          {head}
          {written && <span className="draft-card-text">{written}</span>}
        </button>
      )}
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="下書きの操作" escape="pass" onClose={menu.close}>
          <DraftMenuItems draft={draft} onOpen={() => openDraft(draft)} onRename={() => setRenaming(true)} onClose={menu.close} before={<DraftSplitItems draft={draft} />} />
        </PopupMenu>
      )}
    </>
  );
}
