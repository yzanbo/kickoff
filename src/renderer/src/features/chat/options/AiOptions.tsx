import { EFFORT_LABELS, PERMISSION_LABELS, type ModelOption } from "@shared/types";
import { effortsFor, groupModels, permissionChoices } from "./models";

/** モデルの選択肢（ファミリーごと・新しい順）。一覧にない値が選ばれていれば、その値も出す */
export function ModelOptions({ models, value }: { models: ModelOption[]; value: string | null | undefined }) {
  return (
    <>
      {value && !models.some((m) => m.value === value) && <option value={value}>{value}</option>}
      {groupModels(models).map((g) => (
        <optgroup key={g.family} label={g.family}>
          {g.items.map((i) => (
            <option key={i.value} value={i.value}>
              {i.version} — {i.description}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** 推論の深さを指定しない（null）ときの書き方 */
export const EFFORT_UNSET_LABEL = "指定しない（モデルの既定）";

/** そのモデルで選べる推論の深さの選択肢 */
export function EffortOptions({ model }: { model: ModelOption | undefined }) {
  return (
    <>
      {effortsFor(model).map((level) => (
        <option key={level} value={level}>
          {EFFORT_LABELS[level]}
        </option>
      ))}
    </>
  );
}

/** そのモデルで選べる権限モードの選択肢 */
export function PermissionOptions({ model }: { model: ModelOption | undefined }) {
  return (
    <>
      {permissionChoices(model).map((p) => (
        <option key={p} value={p}>
          {PERMISSION_LABELS[p]}
        </option>
      ))}
    </>
  );
}
