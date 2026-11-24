import "./OptionChoice.css";
import { Brain, Shield, Zap } from "lucide-react";
import type { EffortDefault } from "@shared/ai/types";
import { providerCan } from "@shared/ai/providers";
import { EFFORT_LABELS, PERMISSION_LABELS, PROVIDER_LABELS, type EffortLevel, type PermissionMode, type ProviderId } from "@shared/settings/types";
import { effortsFor, groupModels, modelDisplayName, permissionChoices } from "./models";
import { OptionChoice } from "./OptionChoice";
import type { ChatOptionsState } from "./useChatOptions";
import { ProviderIcon } from "@/features/ai/ui/provider/ProviderIcon";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { useFeatureBlock } from "@/features/ai/ui/provider/chatProvider";

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
function effortDefaultDescription(d: EffortDefault | undefined, provider: ProviderId): string {
  if (!providerCan(provider, "effort_default")) return `指定せず、${PROVIDER_LABELS[provider]} の設定・モデルの既定に任せる`;
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
  const { provider, models, current, model, setModel, effort, setEffort, permission, setPermission, fastMode, fastSupport, setFastMode, effortDefault } = state;
  const efforts = effortsFor(current);
  const fastSupported = fastSupport === "supported";
  // そのチャットの AI でモデルを選べなければ、押せない形にして理由を出す
  const modelBlock = useFeatureBlock("models");

  return (
    <div className="chat-options">
      <OptionChoice
        value={model ?? ""}
        display={modelDisplayName(models, model)}
        icon={<ProviderIcon provider={provider} />}
        label="モデル"
        title={modelBlock ?? current?.description ?? "モデル"}
        disabled={disabled || modelBlock !== null}
        className="model-menu"
        menuClassName="model-menu-choices"
        groups={groupModels(models).map((g) => ({
          label: g.family,
          choices: g.items.map((i) => ({ value: i.value, label: `${g.family} ${i.version}`, description: i.description })),
        }))}
        onChange={(v) => setModel(v || null)}
      />
      <OptionChoice<EffortLevel | "">
        value={effort ?? ""}
        icon={<Brain size={15} />}
        label="推論の深さ"
        // 狭いときはアイコンだけになるので、いまの値も説明に出す
        title={`推論の深さ（effort）: ${effortLabel(effort, effortDefault)}`}
        disabled={disabled}
        groups={[
          {
            label: "推論の深さ",
            choices: [
              { value: "", label: effortDefaultLabel(effortDefault), description: effortDefaultDescription(effortDefault, provider) },
              ...efforts.map((level) => ({ value: level, label: EFFORT_LABELS[level] })),
            ],
          },
        ]}
        onChange={(v) => setEffort(v || null)}
      />
      <OptionChoice
        value={permission}
        icon={<Shield size={15} />}
        label="権限モード"
        title={`権限モード: ${PERMISSION_LABELS[permission]}（入力欄で Shift+Tab を押すと順に切り替わる）`}
        disabled={disabled}
        groups={[
          {
            label: "権限モード",
            choices: permissionChoices(current).map((p) => ({
              value: p,
              label: PERMISSION_LABELS[p],
              description: PERMISSION_HINTS[p],
            })),
          },
        ]}
        onChange={setPermission}
      />
      {/* 非対応と分かったモデル（Codex など）では出さない。取得中・不明のときは押せない形で残す */}
      {fastSupport !== "unsupported" && (
        <IconButton
          type="button"
          icon={Zap}
          iconSize={15}
          className={`fast-toggle ${fastMode ? "on" : ""}`}
          aria-pressed={fastMode}
          label="ファストモード"
          title={
            fastSupport === "loading"
              ? "ファストモード（モデルの対応状況を確認中です）"
              : fastSupport === "unknown"
                ? "ファストモード（このモデルの対応状況を確認できません。対応しているモデルを選んでください）"
                : `ファストモード: ${fastMode ? "オン" : "オフ"}（応答が速くなる代わりに、追加の使用枠から消費します。押すと${fastMode ? "オフ" : "オン"}にします）`
          }
          disabled={disabled || !fastSupported}
          onClick={() => setFastMode(!fastMode)}
        />
      )}
    </div>
  );
}
