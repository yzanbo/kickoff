import { FolderGit2, MessageSquare, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectSummary, Run } from "../../../core/types";
import { api } from "../api";
import { chatTitle } from "../chatTitle";
import { navigate, type Route } from "../router";
import { SECTION_META } from "../sections";

interface Item {
  key: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  route: Route;
}

/** ⌘K: プロジェクトとチャットを名前で探して移動する */
export function CommandPalette({ projects, onClose }: { projects: ProjectSummary[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
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
      ...runs.map((r) => {
        const Icon = SECTION_META[r.phase].icon;
        return {
          key: `r-${r.id}`,
          label: chatTitle(r.title),
          hint: `${names.get(r.project_id) ?? ""} ・ ${SECTION_META[r.phase].label}`,
          icon: Icon ? <Icon size={15} className={`sec-icon sec-${r.phase}`} /> : <MessageSquare size={15} />,
          route: { name: "run", projectId: r.project_id, runId: r.id } as Route,
        };
      }),
    ];
    const q = query.trim().toLowerCase();
    // 何も入力していないときは、新規作成よりチャットとプロジェクトを先に出す
    const filtered = q ? all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q)) : all.filter((i) => !i.key.startsWith("new-"));
    return filtered.slice(0, 50);
  }, [projects, runs, query]);

  useEffect(() => setIndex(0), [query]);

  function go(item: Item | undefined) {
    if (!item) return;
    dialogRef.current?.close();
    navigate(item.route);
  }

  return (
    <dialog ref={dialogRef} className="palette" onClose={onClose} onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}>
      <div className="palette-input">
        <Search size={16} className="muted" />
        <input
          autoFocus
          value={query}
          placeholder="チャット・プロジェクトを検索"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              go(items[index]);
            }
          }}
        />
      </div>
      <ul className="palette-list" role="listbox">
        {items.length === 0 && <li className="palette-empty">見つかりません</li>}
        {items.map((item, i) => (
          <li key={item.key} role="option" aria-selected={i === index}>
            <button className={`palette-item ${i === index ? "active" : ""}`} onMouseEnter={() => setIndex(i)} onClick={() => go(item)}>
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
