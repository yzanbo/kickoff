import { CodeXml, Eye, Save } from "lucide-react";
import type { NoteKind } from "@shared/notes/kinds";
import type { DocumentStatus } from "@/foundation/ui/document/documentState";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { cx } from "@/foundation/ui/lib/cx";

/** 表示の切り替えの説明（種類ごと。preview = 整えて見せる / edit = 中身をそのまま） */
const VIEW_LABELS: Record<NoteKind, { preview: string; edit: string }> = {
  markdown: {
    preview: "Markdown で表示（見出し・太字・リストなどを整えて見せる。カーソルのある行だけ記号を見せる）",
    edit: "そのまま表示（Markdown の記号もそのまま見せる）",
  },
  html: {
    preview: "ページで表示（HTML と CSS を描いた見た目。ここでは書けない）",
    edit: "ソースを表示（HTML と CSS をそのまま書く）",
  },
};

/** 保存の様子の文（見出しの右） */
const SAVE_LABELS: Record<DocumentStatus, string> = {
  loading: "",
  saved: "保存済み",
  dirty: "未保存（⌘S で保存）",
  saving: "保存中…",
  conflict: "ほかで変わりました",
  error: "保存できませんでした",
};

/** 見出しの保存の様子（題名だけ変えていても未保存）と、保存のボタン（読めるときだけ。shown = 読み終えた） */
export function NoteSaveState({ status, titleChanged, shown, savable, onSave }: { status: DocumentStatus; titleChanged: boolean; shown: boolean; savable: boolean; onSave: () => void }) {
  const unsaved = status === "dirty" || status === "conflict" || status === "error" || titleChanged;
  return (
    <>
      <span className={cx("note-save-state", unsaved && "warn")} role="status">
        {shown && SAVE_LABELS[titleChanged && status === "saved" ? "dirty" : status]}
      </span>
      {savable && <IconButton icon={Save} label="保存" keys="⌘S" disabled={(status === "saved" && !titleChanged) || status === "saving"} onClick={onSave} />}
    </>
  );
}

/** 見出しの表示の切り替え（アイコンだけ。名前と説明は乗せたときに出す。整えて見せる = 目、記号のまま = ソースの </>） */
export function NoteViewToggle({ kind, value, onChange }: { kind: NoteKind; value: "preview" | "edit"; onChange: (next: "preview" | "edit") => void }) {
  return (
    <Segmented
      look="toggle"
      label="ノートの表示"
      value={value}
      onChange={onChange}
      options={[
        { value: "preview", label: VIEW_LABELS[kind].preview, icon: Eye, iconOnly: true },
        { value: "edit", label: VIEW_LABELS[kind].edit, icon: CodeXml, iconOnly: true },
      ]}
    />
  );
}
