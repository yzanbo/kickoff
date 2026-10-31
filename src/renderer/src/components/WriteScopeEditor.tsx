import { useState } from "react";
import { PHASE_LABELS, SCOPED_SECTIONS, type Project, type ScopedSection } from "../../../core/types";
import { api } from "../api";

const DEFAULT_SCOPE = ["docs"];

/** 要件定義・スケジュールで AI が書き込めるフォルダの設定 */
export function WriteScopeEditor({ project }: { project: Project }) {
  return (
    <div className="scope-editor">
      {SCOPED_SECTIONS.map((section) => (
        <ScopeRow key={section} project={project} section={section} />
      ))}
    </div>
  );
}

function ScopeRow({ project, section }: { project: Project; section: ScopedSection }) {
  const folders = project.write_scopes?.[section] ?? DEFAULT_SCOPE;
  const [input, setInput] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save(next: string[]) {
    setSaving(true);
    setError(undefined);
    try {
      await api.updateProject(project.id, { write_scopes: { [section]: next } });
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function pick() {
    const picked = await window.kickoff?.pickFolder(`${PHASE_LABELS[section]}で書き込めるフォルダを選択`);
    if (picked) await save([...folders, picked]);
  }

  return (
    <div className="scope-row">
      <div className="scope-label">{PHASE_LABELS[section]}</div>
      <div className="scope-body">
        <div className="scope-chips">
          {folders.length === 0 && <span className="muted small">書き込み不可</span>}
          {folders.map((f) => (
            <span key={f} className="chip">
              {f === "." ? "（リポジトリ全体）" : `${f}/`}
              <button
                className="chip-remove"
                aria-label={`${f} を外す`}
                disabled={saving}
                onClick={() => void save(folders.filter((x) => x !== f))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <form
          className="input-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) void save([...folders, input.trim()]);
          }}
        >
          <input
            type="text"
            aria-label={`${PHASE_LABELS[section]}で書き込めるフォルダを追加`}
            placeholder="docs/specs など（リポジトリからの相対パス）"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="btn" disabled={saving || !input.trim()}>
            追加
          </button>
          {window.kickoff && (
            <button type="button" className="btn" disabled={saving} onClick={() => void pick()}>
              選択…
            </button>
          )}
        </form>
        {error && <p className="error small">{error}</p>}
      </div>
    </div>
  );
}
