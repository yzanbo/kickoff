import { Brain, Shield, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { effectiveEffort, effectivePermission, resolveRunDefaults } from "../../../core/sectionDefaults";
import { EFFORT_LABELS, PERMISSION_LABELS, type EffortLevel, type ModelOption, type PermissionChoice, type Phase, type RunOptions } from "../../../core/types";
import { api } from "../api";
import { cachedLoader } from "../cachedLoader";
import { effortsFor, groupModels, modelDisplayName, permissionChoices } from "../models";
import { ClaudeMark } from "./ClaudeMark";
import { OptionMenu } from "./OptionMenu";

// モデル一覧はアプリ全体で 1 回だけ取得する
const loadModels = cachedLoader<ModelOption[]>(() => api.models("claude"), []);

/**
 * チャット欄で選ぶモデル・推論の深さ・権限モード・ファストモード。
 * 新しいチャットはプロジェクトの既定（なければ設定画面の既定）から始まり、ここでの変更はそのチャットだけに効く。
 * initial を渡すと（既存のチャットを開いたとき）そのチャットの設定から始める。
 */
export function useRunOptions(initial: RunOptions | undefined, section: Phase, projectId?: number) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState<string | null>(initial?.model ?? null);
  const [effort, setEffort] = useState<EffortLevel | null>(initial?.effort ?? null);
  const [permission, setPermission] = useState<PermissionChoice>(initial?.permission_mode ?? "phase");
  const [fastMode, setFastMode] = useState<boolean>(Boolean(initial?.fast_mode));

  useEffect(() => {
    void loadModels().then(setModels);
    if (!initial) {
      void Promise.all([api.settings(), projectId === undefined ? undefined : api.project(projectId)]).then(([s, project]) => {
        const d = resolveRunDefaults(s, project?.defaults);
        setModel((m) => m ?? d.model);
        setEffort(d.effort);
        setPermission(d.permission);
        setFastMode(d.fastMode);
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

  // 「既定」のままでも、実際に使われる値（セクションの既定）を表示・送信する
  const shownEffort = effectiveEffort(section, effort);
  const shownPermission = effectivePermission(section, permission);
  const options: RunOptions = { model, effort: shownEffort, permission_mode: shownPermission, fast_mode: fastMode };
  return {
    models,
    current,
    model,
    setModel,
    effort: shownEffort,
    setEffort,
    permission: shownPermission,
    setPermission,
    fastMode,
    setFastMode,
    options,
  };
}

export type RunOptionsState = ReturnType<typeof useRunOptions>;

/** 権限モードの説明（一覧で名前の下に出す） */
const PERMISSION_HINTS: Partial<Record<PermissionChoice, string>> = {
  default: "ファイルの編集やコマンドの前に毎回確認する",
  acceptEdits: "ファイルの編集は自動で承認し、コマンドは確認する",
  auto: "安全と判断した操作は確認せずに進める",
  plan: "計画を立てるだけで、ファイルは変更しない",
};


/** 入力欄の下に並べる選択（モデル / 推論の深さ / 権限モード / ファストモード） */
export function RunOptionsBar({ state, disabled }: { state: RunOptionsState; disabled?: boolean }) {
  const { models, current, model, setModel, effort, setEffort, permission, setPermission, fastMode, setFastMode } = state;
  const efforts = effortsFor(current);
  const fastSupported = !current || current.supportsFastMode;

  return (
    <div className="run-options">
      <OptionMenu
        value={model ?? ""}
        display={modelDisplayName(models, model)}
        icon={<ClaudeMark />}
        ariaLabel="モデル"
        title={current?.description ?? "モデル"}
        disabled={disabled}
        className="model-menu"
        groups={groupModels(models).map((g) => ({
          label: g.family,
          items: g.items.map((i) => ({ value: i.value, label: `${g.family} ${i.version}`, description: i.description })),
        }))}
        onChange={(v) => setModel(v || null)}
      />
      <OptionMenu
        value={effort}
        icon={<Brain size={15} />}
        ariaLabel="推論の深さ"
        title="推論の深さ（effort）"
        disabled={disabled}
        groups={[{ label: "推論の深さ", items: efforts.map((level) => ({ value: level, label: EFFORT_LABELS[level] })) }]}
        onChange={setEffort}
      />
      <OptionMenu
        value={permission}
        icon={<Shield size={15} />}
        ariaLabel="権限モード"
        title="権限モード"
        disabled={disabled}
        groups={[
          {
            label: "権限モード",
            items: permissionChoices(current)
              .filter((p) => p !== "phase")
              .map((p) => ({
              value: p,
              label: PERMISSION_LABELS[p],
              description: PERMISSION_HINTS[p],
            })),
          },
        ]}
        onChange={setPermission}
      />
      <button
        type="button"
        className={`fast-toggle ${fastMode ? "on" : ""}`}
        aria-pressed={fastMode}
        aria-label="ファストモード"
        disabled={disabled || !fastSupported}
        title={
          !fastSupported
            ? "ファストモード: このモデルは対応していません"
            : fastMode
              ? "ファストモード: オン（応答が速くなる代わりに、追加の使用枠から消費）"
              : "ファストモード: オフ"
        }
        onClick={() => setFastMode(!fastMode)}
      >
        <Zap size={15} fill={fastMode ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
