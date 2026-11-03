import { Brain, Shield, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { resolveRunDefaults } from "../../../../core/runDefaults";
import { EFFORT_LABELS, PERMISSION_LABELS, type EffortLevel, type ModelOption, type PermissionChoice, type RunOptions } from "../../../../core/types";
import { api } from "../../api";
import { cachedLoader } from "../../cachedLoader";
import { effortsFor, groupModels, modelDisplayName, permissionChoices } from "../../models";
import { ClaudeMark } from "../ClaudeMark";
import { OptionMenu } from "../OptionMenu";

// モデル一覧はアプリ全体で 1 回だけ取得する
const loadModels = cachedLoader<ModelOption[]>(() => api.models("claude"), []);

/**
 * チャット欄で選ぶモデル・推論の深さ・権限モード・ファストモード。
 * 新しいチャットはプロジェクトの既定（なければ設定画面の既定）から始まり、ここでの変更はそのチャットだけに効く。
 * initial を渡すと（既存のチャットを開いたとき）そのチャットの設定から始める。
 */
export function useRunOptions(initial: RunOptions | undefined, projectId?: number) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState<string | null>(initial?.model ?? null);
  const [effort, setEffort] = useState<EffortLevel | null>(initial?.effort ?? null);
  const [permission, setPermission] = useState<PermissionChoice>(initial?.permission_mode ?? "default");
  const [fastMode, setFastMode] = useState<boolean>(initial?.fast_mode ?? false);

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
    if (permission === "auto" && !current.supportsAutoMode) setPermission("default");
    if (fastMode && !current.supportsFastMode) setFastMode(false);
  }, [current, effort, permission, fastMode]);

  // 推論の深さの null は「指定しない」（モデルの既定に任せる）
  const options: RunOptions = { model, effort, permission_mode: permission, fast_mode: fastMode };
  return {
    models,
    current,
    model,
    setModel,
    effort,
    setEffort,
    permission,
    setPermission,
    fastMode,
    setFastMode,
    options,
  };
}

export type RunOptionsState = ReturnType<typeof useRunOptions>;

/** 推論の深さを指定しないときの名前 */
const EFFORT_DEFAULT_LABEL = "既定";

function effortLabel(effort: EffortLevel | null): string {
  return effort ? (EFFORT_LABELS[effort] ?? effort) : EFFORT_DEFAULT_LABEL;
}

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
      <OptionMenu<EffortLevel | "">
        value={effort ?? ""}
        icon={<Brain size={15} />}
        ariaLabel="推論の深さ"
        // 狭いときはアイコンだけになるので、いまの値も説明に出す
        title={`推論の深さ（effort）: ${effortLabel(effort)}`}
        disabled={disabled}
        groups={[
          {
            label: "推論の深さ",
            items: [
              { value: "", label: EFFORT_DEFAULT_LABEL, description: "指定せず、モデルの既定に任せる" },
              ...efforts.map((level) => ({ value: level, label: EFFORT_LABELS[level] })),
            ],
          },
        ]}
        onChange={(v) => setEffort(v || null)}
      />
      <OptionMenu
        value={permission}
        icon={<Shield size={15} />}
        ariaLabel="権限モード"
        title={`権限モード: ${PERMISSION_LABELS[permission]}`}
        disabled={disabled}
        groups={[
          {
            label: "権限モード",
            items: permissionChoices(current).map((p) => ({
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
