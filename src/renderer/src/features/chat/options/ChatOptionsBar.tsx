import { Brain, Shield, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { resolveChatOptions } from "@shared/chat/chatOptions";
import { EFFORT_LABELS, PERMISSION_LABELS, type EffortDefault, type EffortLevel, type PermissionMode, type ChatOptions } from "@shared/types";
import { api } from "@/api";
import { useProjects } from "@/stores/projects";
import { useModels } from "@/stores/providers";
import { useAppSettings } from "@/stores/settings";
import { effortsFor, groupModels, modelDisplayName, permissionChoices, withDefaults } from "./models";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { OptionMenu } from "@/ui/OptionMenu";
import { IconButton } from "@/ui/IconButton";

/**
 * チャット欄で選ぶモデル・推論の深さ・権限モード・ファストモード。
 * 新しいチャットはプロジェクトの既定（なければ設定画面の既定）から始まり、ここでの変更はそのチャットだけに効く。
 * 新しいチャットでプロジェクトを替えたら（全プロジェクトのボード）、そのプロジェクトの既定に当て直す。
 * initial を渡すと（既存のチャットを開いたとき）そのチャットの設定から始め、既定は当てない（別のプロジェクトへ移しても、チャットの選択のまま）。
 */
export function useChatOptions(initial: ChatOptions | undefined, projectId?: number, worktree?: string) {
  // モデルの一覧（アプリ全体で 1 回だけ取る）
  const models = useModels("claude");
  const [model, setModel] = useState<string | null>(initial?.model ?? null);
  const [effort, setEffort] = useState<EffortLevel | null>(initial?.effort ?? null);
  const [permission, setPermission] = useState<PermissionMode>(initial?.permission_mode ?? "default");
  const [fastMode, setFastMode] = useState<boolean>(initial?.fast_mode ?? false);

  // 新しいチャットは、設定とプロジェクトが届いたら、その既定から始める（どちらも店から。あとで既定を変えても、選び直したものは変えない）。
  // 既定を当てたプロジェクト（"app" = プロジェクトなし）を覚え、プロジェクトが替わったら当て直す
  const settings = useAppSettings().data;
  const { projectsById, loaded: projectsLoaded } = useProjects();
  const project = projectId === undefined ? undefined : projectsById.get(projectId);
  const fresh = useRef(!initial).current;
  const defaultedFor = useRef<number | "app" | null>(null);
  useEffect(() => {
    const target = projectId ?? "app";
    if (!fresh || defaultedFor.current === target || !settings || (projectId !== undefined && !projectsLoaded)) return;
    // 開いて初めて当てるときは、既定が届く前に選んだモデルを残す
    const first = defaultedFor.current === null;
    defaultedFor.current = target;
    const next = withDefaults({ model, effort, permission_mode: permission, fast_mode: fastMode }, resolveChatOptions(settings, project?.chat_defaults), first);
    setModel(next.model);
    setEffort(next.effort);
    setPermission(next.permission_mode);
    setFastMode(next.fast_mode);
    // 選んでいる値が変わっても当て直さない（プロジェクトと既定が届いたときだけ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, projectId, projectsLoaded, project]);

  const current = models.find((m) => m.value === model);
  // 選んだモデルが対応していない深さ・Auto mode・ファストモードは外す
  useEffect(() => {
    if (!current) return;
    if (effort && !current.efforts.includes(effort)) setEffort(null);
    if (permission === "auto" && !current.supports_auto_mode) setPermission("default");
    if (fastMode && !current.supports_fast_mode) setFastMode(false);
  }, [current, effort, permission, fastMode]);

  // 深さを指定しないとき（既定）に、実際に使われる深さ（Claude Code の設定から。モデルを変えたら取り直す）
  const modelId = current?.resolved_model ?? model;
  const [effortDefault, setEffortDefault] = useState<EffortDefault>();
  useEffect(() => {
    if (projectId === undefined) return;
    let alive = true;
    api
      .effortDefault(projectId, modelId, worktree)
      .then((d) => alive && setEffortDefault(d))
      .catch(() => alive && setEffortDefault(undefined));
    return () => {
      alive = false;
    };
  }, [projectId, modelId, worktree]);

  // 推論の深さの null は「指定しない」（モデルの既定に任せる）
  const options: ChatOptions = { model, effort, permission_mode: permission, fast_mode: fastMode };
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
    effortDefault,
    options,
  };
}

export type ChatOptionsState = ReturnType<typeof useChatOptions>;

/** 既定の深さが、どこで決まったか */
const EFFORT_SOURCE_LABELS: Record<NonNullable<EffortDefault["source"]>, string> = {
  env: "環境変数 CLAUDE_CODE_EFFORT_LEVEL",
  local: "作業フォルダの .claude/settings.local.json",
  project: "作業フォルダの .claude/settings.json",
  user: "~/.claude/settings.json",
};

/**
 * 推論の深さを指定しないとき（既定）の名前。Claude Code の設定で決まる値を添える（「既定（最大）」）。
 * 設定のどこにもなければ「既定（モデル任せ）」（モデルの既定で決まり、Kickoff からは値が分からない）
 */
function effortDefaultLabel(d: EffortDefault | undefined): string {
  if (!d) return "既定";
  return d.effort ? `既定（${EFFORT_LABELS[d.effort] ?? d.effort}）` : "既定（モデル任せ）";
}

/** 既定の深さの説明（メニューの項目の下に出す） */
function effortDefaultDescription(d: EffortDefault | undefined): string {
  if (d?.effort && d.source) return `指定しない（${EFFORT_SOURCE_LABELS[d.source]} の値を使う）`;
  if (d) return "指定しない（Claude Code の設定にないので、モデルの既定を使う。値は分からない）";
  return "指定せず、Claude Code の設定・モデルの既定に任せる";
}

function effortLabel(effort: EffortLevel | null, d: EffortDefault | undefined): string {
  return effort ? (EFFORT_LABELS[effort] ?? effort) : effortDefaultLabel(d);
}

/** 権限モードの説明（一覧で名前の下に出す） */
const PERMISSION_HINTS: Partial<Record<PermissionMode, string>> = {
  default: "ファイルの編集やコマンドの前に毎回確認する",
  acceptEdits: "ファイルの編集は自動で承認し、コマンドは確認する",
  auto: "安全と判断した操作は確認せずに進める",
  plan: "計画を立てるだけで、ファイルは変更しない",
};


/** 入力欄の下に並べる選択（モデル / 推論の深さ / 権限モード / ファストモード） */
export function ChatOptionsBar({ state, disabled }: { state: ChatOptionsState; disabled?: boolean }) {
  const { models, current, model, setModel, effort, setEffort, permission, setPermission, fastMode, setFastMode, effortDefault } = state;
  const efforts = effortsFor(current);
  const fastSupported = !current || current.supports_fast_mode;

  return (
    <div className="chat-options">
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
        title={`推論の深さ（effort）: ${effortLabel(effort, effortDefault)}`}
        disabled={disabled}
        groups={[
          {
            label: "推論の深さ",
            items: [
              { value: "", label: effortDefaultLabel(effortDefault), description: effortDefaultDescription(effortDefault) },
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
        title={`権限モード: ${PERMISSION_LABELS[permission]}（入力欄で Shift+Tab を押すと順に切り替わる）`}
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
      <IconButton
        type="button"
        icon={Zap}
        size={15}
        className={`fast-toggle ${fastMode ? "on" : ""}`}
        aria-pressed={fastMode}
        label="ファストモード"
        title={
          !fastSupported
            ? "ファストモード（このモデルは対応していません。対応しているモデルを選ぶと使えます）"
            : `ファストモード: ${fastMode ? "オン" : "オフ"}（応答が速くなる代わりに、追加の使用枠から消費します。押すと${fastMode ? "オフ" : "オン"}にします）`
        }
        disabled={disabled || !fastSupported}
        onClick={() => setFastMode(!fastMode)}
      />
    </div>
  );
}
