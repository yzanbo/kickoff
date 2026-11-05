import { SquarePen, Trash2 } from "lucide-react";
import { cx } from "@/lib/cx";
import { useProjects } from "@/stores/projects";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { discardDraft, openDraft, type PanelDraft } from "@/features/panel/state/panelDrafts";
import { NEW_CHAT_TITLE } from "@/features/chat/chatTitle";
import { ProjectChip } from "@/features/project/ProjectChip";

/**
 * 列・グループに出す、送る前の新しいチャット（パネル・チャット欄で入力中）の下書き（押すとその欄で開き、表示中なら選択中に見せる。
 * 欄が画面になければ、その画面へ移ってから開く）。showProject: プロジェクトのバッジを付ける（いくつかのプロジェクトの下書きが並ぶ全プロジェクトのボード）
 */
export function DraftCards({ drafts, showProject = false }: { drafts: readonly PanelDraft[]; showProject?: boolean }) {
  const { projectName } = useProjects();
  return drafts.map((d) => (
    <DraftCard
      key={`${d.panel}:${d.key}`}
      text={d.text}
      active={d.showing}
      project={showProject ? { id: d.projectId, name: projectName(d.projectId) } : undefined}
      onOpen={() => openDraft(d)}
      onDelete={() => discardDraft(d)}
    />
  ));
}

/** 下書きのカード。書いている途中の文があれば、その初めの数行を出す。押すとそのタブを表示し、右クリックで開く・削除を選べる */
function DraftCard({
  text,
  active,
  project,
  onOpen,
  onDelete,
}: {
  text: string;
  active: boolean;
  /** どのプロジェクトの下書きか（全プロジェクトのボードだけ） */
  project?: { id: number; name: string };
  onOpen: () => void;
  onDelete: () => void;
}) {
  const written = text.trim();
  const menu = useContextMenu();
  return (
    <>
      <button
        type="button"
        className={cx("draft-card", active && "selected")}
        title={project ? `プロジェクト「${project.name}」で入力中の新しいチャット（押すと開きます。右クリックで削除）` : "右側で入力中の新しいチャット（右クリックで削除）"}
        onClick={onOpen}
        onContextMenu={menu.open}
      >
        <span className="draft-card-head">
          <SquarePen size={13} aria-hidden />
          {written ? "書きかけ" : NEW_CHAT_TITLE}
          {project && <ProjectChip id={project.id} name={project.name} />}
        </span>
        {written && <span className="draft-card-text">{written}</span>}
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} onClose={menu.close}>
          <MenuItem onSelect={onOpen}>
            <SquarePen size={14} /> 開く
          </MenuItem>
          <MenuItem danger onSelect={onDelete}>
            <Trash2 size={14} /> 削除（入力中の内容は消えます）
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
