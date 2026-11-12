import { useState } from "react";
import { Check, Tag, UserRound } from "lucide-react";
import { api } from "@/api";
import { useKeyedAsync } from "@/hooks/useKeyedAsync";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";

const KINDS = {
  labels: { label: "ラベル", icon: Tag, empty: "リポジトリにラベルがありません" },
  assignees: { label: "担当", icon: UserRound, empty: "担当にできる人がいません" },
} as const;

/**
 * ラベル・担当を選ぶ札（「ラベル」「担当」。リポジトリのラベル（色の点つき）・担当にできる人をチェックの一覧にし、続けて切り替えられる）。
 * onCommit は閉じたときに、開いたときから変わっていれば選んだものすべてで呼ぶ（GitHub と同じく、閉じるまでまとめる）
 */
export function GitHubLabelPicker({
  projectId,
  kind = "labels",
  selected,
  onCommit,
  disabled,
}: {
  projectId: number;
  kind?: keyof typeof KINDS;
  selected: string[];
  onCommit: (names: string[]) => void;
  disabled?: boolean;
}) {
  const menu = useContextMenu<null>();
  const meta = useKeyedAsync(String(projectId), () => api.githubMeta(projectId));
  const [picked, setPicked] = useState<string[]>(selected);
  const open = menu.menu !== null;
  const close = () => {
    menu.close();
    const before = [...selected].sort().join("\n");
    if ([...picked].sort().join("\n") !== before) onCommit(picked);
  };
  const { label, icon: Icon, empty } = KINDS[kind];
  const items: { name: string; color: string | null }[] =
    kind === "labels" ? (meta.data?.labels ?? []).map((l) => ({ name: l.name, color: l.color })) : (meta.data?.assignees ?? []).map((u) => ({ name: u.login, color: null }));
  return (
    <>
      <button
        type="button"
        className={`github-label-picker github-picker-${kind} btn btn-sm`}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          if (open) return close();
          setPicked(selected);
          menu.openBelow(e, null);
        }}
      >
        <Icon size={13} aria-hidden /> {label}
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={label} ignore={`.github-picker-${kind}`} onClose={close}>
          {meta.error && (
            <MenuItem disabled onSelect={() => undefined}>
              {label}の候補を読めませんでした
            </MenuItem>
          )}
          {!meta.data && !meta.error && (
            <MenuItem disabled onSelect={() => undefined}>
              読み込み中…
            </MenuItem>
          )}
          {meta.data && items.length === 0 && (
            <MenuItem disabled onSelect={() => undefined}>
              {empty}
            </MenuItem>
          )}
          {items.map((l) => {
            const on = picked.includes(l.name);
            return (
              <MenuItem key={l.name} role="menuitemcheckbox" checked={on} keepOpen onSelect={() => setPicked(on ? picked.filter((x) => x !== l.name) : [...picked, l.name])}>
                {l.color && <span className="github-label-dot" style={{ background: `#${l.color}` }} aria-hidden />}
                <span className="project-switch-item">{l.name}</span>
                {on && <Check size={14} aria-hidden />}
              </MenuItem>
            );
          })}
        </PopupMenu>
      )}
    </>
  );
}
