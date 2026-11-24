// チャット欄の選択（モデル・推論の深さ・権限モード・ファストモード）の純粋な決まり: 既定の当て方と、モデルに合わない選択の外し方
import type { ChatOptions } from "@shared/settings/types";
import type { ModelOption } from "@shared/ai/types";
import { providerCan } from "@shared/ai/providers";
import type { ProviderId } from "@shared/settings/types";

/** 既定を当てた先（プロジェクト。"app" = プロジェクトなしで設定の既定）と AI */
export interface DefaultedFor {
  target: number | "app";
  provider: ProviderId;
}

/**
 * 新しいチャットの選択に既定（設定とプロジェクトの既定を重ねたもの）を当てる。
 * keepModel: 既定が届く前に自分で選んだモデルは残す（開いて初めて当てるとき）。プロジェクトを替えたときは、そのプロジェクトの既定にすべて当て直す
 */
function withDefaults(current: ChatOptions, defaults: ChatOptions, keepModel: boolean): ChatOptions {
  return { ...defaults, model: keepModel ? (current.model ?? defaults.model) : defaults.model };
}

/**
 * 新しいチャットに既定を当てた選択（当てなくてよければ null）。prev は前に当てた先（まだなら null）、next はいまの先。
 * 同じ先・同じ AI なら当てない（あとで既定を変えても、選び直したものは変えない）。AI だけを替えたら、モデルと推論の深さだけを新しい AI の既定にする
 * （権限モードは利用者が選んだまま。使えなければ fitChatOptions で外れる）。開いて初めて当てるときは既定が届く前に選んだモデルを残し、プロジェクトを替えたらすべて当て直す
 */
export function initialChatOptions(current: ChatOptions, defaults: ChatOptions, prev: DefaultedFor | null, next: DefaultedFor): ChatOptions | null {
  if (prev?.target === next.target && prev.provider === next.provider) return null;
  if (prev && prev.target === next.target) return { ...current, model: defaults.model, effort: defaults.effort };
  return withDefaults(current, defaults, prev === null);
}

/**
 * 一覧にないモデル（ほかの AI のモデル・その AI の既定 = null）を、その AI の既定のモデル（一覧の `is_default`。なければ null）に直す。
 * 一覧が届くまでと、一覧の外の名前も受け付ける AI（表の any_model）は直さない
 */
export function fallbackModel(models: readonly ModelOption[], model: string | null, provider: ProviderId): string | null {
  if (providerCan(provider, "any_model") || models.length === 0 || models.some((m) => m.value === model)) return model;
  return models.find((m) => m.is_default)?.value ?? null;
}

/**
 * 選択をモデルに合わせる（変えなくてよければ同じ物を返す）: 一覧にないモデルは fallbackModel、そのモデルが対応していない深さ・Auto mode・ファストモードは外す。
 * モデルが分からない（一覧にない・届く前）ときはモデルのほかを外さない
 */
export function fitChatOptions(options: ChatOptions, models: readonly ModelOption[], provider: ProviderId): ChatOptions {
  const model = fallbackModel(models, options.model, provider);
  const current = models.find((m) => m.value === model);
  const effort = current && options.effort && !current.efforts.includes(options.effort) ? null : options.effort;
  const permission_mode = current && options.permission_mode === "auto" && !current.supports_auto_mode ? "default" : options.permission_mode;
  const fast_mode = current && options.fast_mode && current.supports_fast_mode === false ? false : options.fast_mode;
  if (model === options.model && effort === options.effort && permission_mode === options.permission_mode && fast_mode === options.fast_mode) return options;
  return { model, effort, permission_mode, fast_mode };
}
