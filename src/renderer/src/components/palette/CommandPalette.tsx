import { FolderGit2, MessageSquare, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Run } from "../../../../core/types";
import { api } from "../../api";
import { chatTitle } from "../../chatTitle";
import { useListNavigation } from "../../hooks/useListNavigation";
import { useModalDialog } from "../../hooks/useModalDialog";
import { useProjects } from "../../projectsContext";
import { navigate, type Route } from "../../router";

interface Item {
  key: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  route: Route;
}

/** ⌘K: プロジェクトとチャットを名前で探して移動する */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { projects } = useProjects();
  const [query, setQuery] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const dialog = useModalDialog();

  useEffect(() => {
    void api.allRuns().then(setRuns).catch(() => {});
  }, []);

  const items = useMemo<Item[]>(() => {
    const names = new Map(projects.map((p) => [p.id, p.name]));
    const all: Item[] = [
      ...projects.map((p) => ({
        key: `new-${p.id}`,
        label: `${p.name} で新しいチャット`,
        hint: "新規",
        icon: <Plus size={15} />,
        route: { name: "newChat", projectId: p.id } as Route,
      })),
      ...projects.map((p) => ({
        key: `p-${p.id}`,
        label: p.name,
        hint: "プロジェクト",
        icon: <FolderGit2 size={15} />,
        route: { name: "project", id: p.id, tab: "board" } as Route,
      })),
      ...runs.map((r) => ({
        key: `r-${r.id}`,
        label: chatTitle(r.title),
        hint: names.get(r.project_id) ?? "",
        icon: <MessageSquare size={15} />,
        route: { name: "run", projectId: r.project_id, runId: r.id } as Route,
      })),
    ];
    const q = query.trim().toLowerCase();
    // 何も入力していないときは、新規作成よりチャットとプロジェクトを先に出す
    const filtered = q ? all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q)) : all.filter((i) => !i.key.startsWith("new-"));
    return filtered.slice(0, 50);
  }, [projects, runs, query]);

  function go(item: Item | undefined) {
    if (!item) return;
    dialog.close();
    navigate(item.route);
  }
  const nav = useListNavigation(items, go);
  useEffect(() => nav.setIndex(0), [query]);

  return (
    <dialog ref={dialog.ref} className="palette" onClose={onClose} {...dialog.backdropProps}>
      <div className="palette-input">
        <Search size={16} className="muted" />
        <input
          autoFocus
          value={query}
          placeholder="チャット・プロジェクトを検索"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={nav.onKeyDown}
        />
      </div>
      <ul className="palette-list" role="listbox">
        {items.length === 0 && <li className="palette-empty">見つかりません</li>}
        {items.map((item, i) => (
          <li key={item.key} role="option" aria-selected={i === nav.index}>
            <button className={`palette-item ${i === nav.index ? "active" : ""}`} onMouseEnter={() => nav.setIndex(i)} onClick={() => go(item)}>
              {item.icon}
              <span className="palette-label">{item.label}</span>
              <span className="palette-hint">{item.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
