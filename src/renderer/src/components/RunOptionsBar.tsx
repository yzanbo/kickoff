import { Brain, Shield, Sparkle, Zap } from "lucide-react";
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

/**
 * チャット欄で選ぶモデル・推論の深さ・権限モード・ファストモード。
 * 新しいチャットは設定画面の既定から始まり、ここでの変更はそのチャットだけに効く。
 * initial を渡すと（既存のチャットを開いたとき）そのチャットの設定から始める。
 */
export function useRunOptions(initial?: RunOptions) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState<string | null>(initial?.model ?? null);
  const [effort, setEffort] = useState<EffortLevel | null>(initial?.effort ?? null);
  const [permission, setPermission] = useState<PermissionChoice>(initial?.permission_mode ?? "phase");
  const [fastMode, setFastMode] = useState<boolean>(Boolean(initial?.fast_mode));

  useEffect(() => {
    void loadModels().then(setModels);
    if (!initial) {
      void api.settings().then((s) => {
        setModel((m) => m ?? s.claudeModel);
        setEffort(s.defaultEffort);
        setPermission(s.defaultPermission);
        setFastMode(s.defaultFastMode);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = models.find((m) => m.value === model);
  // 選んだモデルが対応していない深さ・Auto mode・ファストモードは外す
  useEffect(() => {
    if (!current) return;
    if (effort && !current.efforts.includes(effort)) setEffort(null);
    if (permission === "auto" && !current.supportsAutoMode) setPermission("phase");
    if (fastMode && !current.supportsFastMode) setFastMode(false);
  }, [current, effort, permission, fastMode]);

  const options: RunOptions = { model, effort, permission_mode: permission, fast_mode: fastMode };
  return { models, current, model, setModel, effort, setEffort, permission, setPermission, fastMode, setFastMode, options };
}

export type RunOptionsState = ReturnType<typeof useRunOptions>;

/** 入力欄の下に並べる選択（モデル / 推論の深さ / 権限モード） */
export function RunOptionsBar({ state, disabled }: { state: RunOptionsState; disabled?: boolean }) {
  const { models, current, model, setModel, effort, setEffort, permission, setPermission, fastMode, setFastMode } = state;
  const efforts = current?.efforts ?? (Object.keys(EFFORT_LABELS) as EffortLevel[]);

  return (
    <div className="run-options">
      <label className="pill-select" title={current?.description ?? "モデル"}>
        <Sparkle size={14} aria-hidden />
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
        <Brain size={14} aria-hidden />
        <select
          aria-label="推論の深さ"
          value={effort ?? ""}
          disabled={disabled}
          onChange={(e) => setEffort((e.target.value || null) as EffortLevel | null)}
        >
          <option value="">既定</option>
          {efforts.map((level) => (
            <option key={level} value={level}>
              {EFFORT_LABELS[level]}
            </option>
          ))}
        </select>
      </label>

      <label className="pill-select" title="権限モード">
        <Shield size={14} aria-hidden />
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

      {(!current || current.supportsFastMode) && (
        <button
          type="button"
          className={`fast-toggle ${fastMode ? "on" : ""}`}
          aria-pressed={fastMode}
          disabled={disabled}
          title={fastMode ? "ファストモード: オン（追加の使用枠から消費）" : "ファストモード: オフ"}
          onClick={() => setFastMode(!fastMode)}
        >
          <Zap size={14} fill={fastMode ? "currentColor" : "none"} />
          {fastMode && <span className="fast-label">Fast</span>}
        </button>
      )}
    </div>
  );
}
