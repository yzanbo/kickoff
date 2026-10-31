import { useEffect, useState } from "react";
import {
  EFFORT_LABELS,
  PERMISSION_CHOICES,
  PERMISSION_LABELS,
  type EffortLevel,
  type ModelOption,
  type PermissionChoice,
  type RunOptions,
} from "../../../core/types";
import { api } from "../api";

// モデル一覧はアプリ全体で 1 回だけ取得する
let modelsPromise: Promise<ModelOption[]> | undefined;
function loadModels() {
  modelsPromise ??= api.models("claude").catch(() => {
    modelsPromise = undefined;
    return [];
  });
  return modelsPromise;
}

const STORAGE_KEY = "kickoff:run-options";

interface StoredOptions {
  effort: EffortLevel | null;
  permission_mode: PermissionChoice;
}

function loadStored(): StoredOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<StoredOptions>;
    return { effort: raw.effort ?? null, permission_mode: raw.permission_mode ?? "phase" };
  } catch {
    return { effort: null, permission_mode: "phase" };
  }
}

/**
 * チャット欄で選ぶモデル・推論の深さ・権限モード。
 * モデルは最後に選んだものがサーバーに記録され、深さと権限モードはこの端末に記録される。
 * initial を渡すと（既存の会話を開いたとき）その会話の設定から始める。
 */
export function useRunOptions(initial?: RunOptions) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState<string | null>(initial?.model ?? null);
  const stored = loadStored();
  const [effort, setEffort] = useState<EffortLevel | null>(initial ? (initial.effort ?? null) : stored.effort);
  const [permission, setPermission] = useState<PermissionChoice>(
    initial?.permission_mode ?? stored.permission_mode,
  );

  useEffect(() => {
    void loadModels().then(setModels);
    if (!initial?.model) void api.settings().then((s) => setModel((m) => m ?? s.claudeModel));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ effort, permission_mode: permission }));
  }, [effort, permission]);

  const current = models.find((m) => m.value === model);
  // 選んだモデルが対応していない深さ・Auto mode は外す
  useEffect(() => {
    if (!current) return;
    if (effort && !current.efforts.includes(effort)) setEffort(null);
    if (permission === "auto" && !current.supportsAutoMode) setPermission("phase");
  }, [current, effort, permission]);

  const options: RunOptions = { model, effort, permission_mode: permission };
  return { models, current, model, setModel, effort, setEffort, permission, setPermission, options };
}

export type RunOptionsState = ReturnType<typeof useRunOptions>;

/** 入力欄の下に並べる選択（モデル / 推論の深さ / 権限モード） */
export function RunOptionsBar({ state, disabled }: { state: RunOptionsState; disabled?: boolean }) {
  const { models, current, model, setModel, effort, setEffort, permission, setPermission } = state;
  const efforts = current?.efforts ?? (Object.keys(EFFORT_LABELS) as EffortLevel[]);

  return (
    <div className="run-options">
      <label className="pill-select" title={current?.description ?? "モデル"}>
        <span aria-hidden>✳</span>
        <select aria-label="モデル" value={model ?? ""} disabled={disabled} onChange={(e) => setModel(e.target.value || null)}>
          {models.length === 0 && <option value={model ?? ""}>{model ?? "読み込み中…"}</option>}
          {models.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="pill-select" title="推論の深さ">
        <span aria-hidden>◎</span>
        <select
          aria-label="推論の深さ"
          value={effort ?? ""}
          disabled={disabled}
          onChange={(e) => setEffort((e.target.value || null) as EffortLevel | null)}
        >
          <option value="">既定の深さ</option>
          {efforts.map((level) => (
            <option key={level} value={level}>
              {EFFORT_LABELS[level]}
            </option>
          ))}
        </select>
      </label>

      <label className="pill-select" title="権限モード">
        <span aria-hidden>⛨</span>
        <select
          aria-label="権限モード"
          value={permission}
          disabled={disabled}
          onChange={(e) => setPermission(e.target.value as PermissionChoice)}
        >
          {PERMISSION_CHOICES.filter((p) => p !== "auto" || !current || current.supportsAutoMode).map((p) => (
            <option key={p} value={p}>
              {PERMISSION_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
