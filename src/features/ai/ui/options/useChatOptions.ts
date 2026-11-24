// チャット欄の選択（モデル・推論の深さ・権限モード・ファストモード）の状態と操作。決まりは chatOptionsRules.ts
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { resolveChatOptions } from "@shared/ai/chatOptions";
import type { EffortDefault } from "@shared/ai/types";
import { providerCan } from "@shared/ai/providers";
import type { ChatOptions, EffortLevel, PermissionMode, ProviderId } from "@shared/settings/types";
import { providersApi } from "@/features/ai/ui/api/providers";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore } from "@/foundation/ui/store/useStore";
import { useProjects } from "@/features/projects/ui";
import { NO_MODELS, useModelsState } from "@/features/ai/ui/stores/providers";
import { useProjectAiDefaults } from "@/features/ai/ui/stores/projectAiDefaults";
import { useAppSettings } from "@/foundation/ui/settings/appSettings";
import { fitChatOptions, initialChatOptions, type DefaultedFor } from "./chatOptionsRules";
import { fastSupportOf } from "./models";

/** 既定の深さを取り直すまでの間（Claude Code の設定を書き換えたら、しばらくして直る） */
const EFFORT_DEFAULT_MAX_AGE_MS = 60_000;

/** プロジェクト・モデル・作業場所の key（本体は作業場所が空） */
const effortKeyOf = (projectId: number, model: string | null, worktree: string | undefined) => `${projectId}\n${model ?? ""}\n${worktree ?? ""}`;

/**
 * 深さを指定しないときに使われる深さ（プロジェクト・モデル・作業場所ごと。チャット欄がいくつあっても、取りに行くのは key ごとに 1 回。
 * 描いたときの effect で取ると、隠したタブを表に戻すたびに同じ値を取り直す）
 */
const effortDefaults = createKeyedStore<string, EffortDefault>({
  load: (key) => {
    const [projectId, model, worktree] = key.split("\n");
    return providersApi.effortDefault(Number(projectId), model || null, worktree || undefined);
  },
  maxAge: EFFORT_DEFAULT_MAX_AGE_MS,
});

/** チャットの選択の初めの値（チャットの設定から。なければ何も指定しない） */
const pickedFrom = (initial: ChatOptions | undefined): ChatOptions => ({
  model: initial?.model ?? null,
  effort: initial?.effort ?? null,
  permission_mode: initial?.permission_mode ?? "default",
  fast_mode: initial?.fast_mode ?? false,
});

export interface ChatOptionsInput {
  /** 既存のチャットの選択（渡すとそこから始め、既定は当てない。別のプロジェクトへ移しても、チャットの選択のまま） */
  initial?: ChatOptions;
  projectId?: number;
  /** 作業場所（既定の深さを読む。本体は省く） */
  worktree?: string;
  /** そのチャットの AI（モデルの一覧をその AI から読む。省けばプロジェクトの AI） */
  provider?: ProviderId;
}

/**
 * チャット欄で選ぶモデル・推論の深さ・権限モード・ファストモード。
 * 新しいチャットはプロジェクトの既定（なければ設定画面の既定）から始まり、ここでの変更はそのチャットだけに効く。
 * 新しいチャットでプロジェクトを替えたら（全プロジェクトのボード）、そのプロジェクトの既定に当て直す。AI を替えたら、モデル・推論の深さをその AI の既定に当て直す
 * （前の AI のモデルの名前を残すと、その AI に知らない名前を渡す）。選択は描くたびに fitChatOptions でモデルに合わせる（外したものは戻さない）。
 */
export function useChatOptions({ initial, projectId, worktree, provider: providerArg }: ChatOptionsInput) {
  const settings = useAppSettings().data;
  const { projectsById, loaded: projectsLoaded } = useProjects();
  const project = projectId === undefined ? undefined : projectsById.get(projectId);
  // プロジェクトの AI ごとの既定（新しいチャットだけが読む。既存のチャットはチャットの選択から始める）
  const { data: projectDefaults, loaded: projectDefaultsLoaded } = useProjectAiDefaults(initial ? undefined : projectId);
  const provider: ProviderId = providerArg ?? project?.provider ?? "claude";
  // モデルの一覧（AI ごとにアプリ全体で 1 回だけ取る）
  const modelState = useModelsState(provider);
  const models = modelState.data ?? NO_MODELS;
  const [picked, setPicked] = useState<ChatOptions>(() => pickedFrom(initial));
  // 既存のチャットの AI を途中で替えたら、コアが当て直したそのチャットの選択に合わせ直す。
  // 前の AI のモデル・権限モードを残すと、確認画面で見せた値と違うものを新しい AI に送ってしまう（Claude Code は一覧の外のモデル名も受け付けるので、下の合わせ直しでも直らない）
  const [optionsProvider, setOptionsProvider] = useState(provider);
  if (initial && optionsProvider !== provider) {
    setOptionsProvider(provider);
    setPicked(pickedFrom(initial));
  }
  // 一覧にないモデルはその AI の既定のモデルに、選んだモデルが対応していない深さ・Auto mode・ファストモードは外す（描く中で直す。同じなら同じ物）
  const fitted = fitChatOptions(picked, models, provider);
  if (fitted !== picked) setPicked(fitted);
  const { model, effort, permission_mode: permission, fast_mode: fastMode } = fitted;

  // 新しいチャットは、設定とプロジェクト（と AI ごとの既定）が届いたら、その既定から始める（どれも店から）。既定を当てたプロジェクトと AI を覚え、替わったら当て直す
  const [fresh] = useState(!initial);
  const defaultedFor = useRef<DefaultedFor | null>(null);
  // 選んでいる値が変わっても当て直さない（プロジェクト・AI・既定が届いたときだけ）
  const applyDefaults = useEffectEvent(() => {
    if (!fresh || !settings || (projectId !== undefined && (!projectsLoaded || !projectDefaultsLoaded))) return;
    const target: DefaultedFor = { target: projectId ?? "app", provider };
    const next = initialChatOptions(picked, resolveChatOptions(settings, provider, projectDefaults), defaultedFor.current, target);
    if (!next) return;
    defaultedFor.current = target;
    setPicked(next);
  });
  useEffect(() => {
    applyDefaults();
  }, [settings, projectId, projectsLoaded, project, projectDefaults, provider]);

  const current = models.find((m) => m.value === model);
  const fastSupport = fastSupportOf(current, modelState.loading);

  // 深さを指定しないとき（既定）に、実際に使われる深さ（Claude Code の設定から。モデルを変えたら取り直す。既定の深さを読めない AI は読まない）
  const modelId = current?.resolved_model ?? model;
  const effortDefault = useKeyedStore(effortDefaults, projectId === undefined || !providerCan(provider, "effort_default") ? undefined : effortKeyOf(projectId, modelId, worktree)).data;

  // 推論の深さの null は「指定しない」（モデルの既定に任せる）。ファストモードは対応が分からない間、希望を消さず実行にも渡さない
  const effectiveFastMode = fastSupport === "supported" && fastMode;
  const options: ChatOptions = { model, effort, permission_mode: permission, fast_mode: effectiveFastMode };
  return {
    provider,
    models,
    current,
    model,
    setModel: (value: string | null) => setPicked((p) => ({ ...p, model: value })),
    effort,
    setEffort: (value: EffortLevel | null) => setPicked((p) => ({ ...p, effort: value })),
    permission,
    setPermission: (value: PermissionMode) => setPicked((p) => ({ ...p, permission_mode: value })),
    fastMode: effectiveFastMode,
    fastSupport,
    setFastMode: (value: boolean) => setPicked((p) => ({ ...p, fast_mode: value })),
    effortDefault,
    options,
  };
}

export type ChatOptionsState = ReturnType<typeof useChatOptions>;
