import { Bot, Check, FileText, FolderLock, Library, MessageSquarePlus, Sparkles, SquareTerminal, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  BOARD_STAGE_LABELS,
  BOARD_STAGES,
  EFFORT_LABELS,
  EFFORT_LEVELS,
  PERMISSION_CHOICES,
  PERMISSION_LABELS,
  PHASES,
  PROVIDER_IDS,
  type AppSettings,
  type BoardStage,
  type EffortLevel,
  type PermissionChoice,
  type Phase,
  type Project,
  type ProjectDefaults,
  type ProviderId,
  type ProviderStatus,
} from "../../../core/types";
import { api, useAsync } from "../api";
import { groupModels, modelDisplayName } from "../models";
import { navigate } from "../router";
import { SECTION_META } from "../sections";
import { planLabel } from "../usage";
import { ClaudeMark } from "./ClaudeMark";
import { ReferenceEditor } from "./ReferenceEditor";
import { WriteScopeEditor } from "./WriteScopeEditor";
import { confirmDialog } from "../dialogs";

/** 「アプリの設定に従う」を表す select の値 */
const INHERIT = "__inherit__";

type Message = { kind: "ok" | "error"; text: string } | undefined;

/** 保存ボタンと結果の表示（フォームごと） */
function useSave() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>();
  const run = async (action: () => Promise<unknown>) => {
    setSaving(true);
    setMessage(undefined);
    try {
      await action();
      setMessage({ kind: "ok", text: "保存しました" });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };
  return { saving, message, run };
}

type SectionKey = "basic" | "refs" | "ai" | "chat" | "scope" | "danger";

const SECTIONS: { key: SectionKey; label: string; icon: typeof Bot }[] = [
  { key: "basic", label: "基本情報", icon: FileText },
  { key: "refs", label: "参照資料", icon: Library },
  { key: "ai", label: "AI", icon: Bot },
  { key: "chat", label: "新しいチャット", icon: MessageSquarePlus },
  { key: "scope", label: "書き込みできるフォルダ", icon: FolderLock },
  { key: "danger", label: "削除", icon: Trash2 },
];

/**
 * プロジェクトの設定（プロジェクト名の横の「編集」から開くダイアログの中身）。
 * 左の一覧で項目を切り替える: 基本情報・AI・新しいチャットの既定・書き込みできるフォルダ・削除
 */
export function ProjectSettings({ project }: { project: Project }) {
  const [section, setSection] = useState<SectionKey>("basic");
  const settings = useAsync(api.settings);
  return (
    <div className="project-settings">
      <nav className="project-settings-nav" aria-label="設定の項目">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`project-settings-tab ${section === key ? "active" : ""} ${key === "danger" ? "danger" : ""}`}
            aria-current={section === key}
            onClick={() => setSection(key)}
          >
            <Icon size={15} aria-hidden />
            {label}
          </button>
        ))}
      </nav>
      <div className="project-settings-content">
        {section === "basic" && <BasicInfo project={project} />}
        {section === "refs" && (
          <section className="section">
            <h2>参照資料</h2>
            <p className="muted small">
              く、このプロジェクトのチャットで AI がいつでも読めるフォルダ・ファイルです。AI には一覧が伝わり、必要に応じて中身を読みます（書き込みはできません）。
            </p>
            <ReferenceEditor project={project} />
          </section>
        )}
        {section === "ai" && <AiSection project={project} app={settings.data} />}
        {section === "chat" && <ChatDefaults project={project} />}
        {section === "scope" && (
          <section className="section">
            <h2>書き込みできるフォルダ</h2>
            <p className="muted small">
              要件定義・スケジュールのチャットで AI が書き込めるフォルダです。ここ以外への書き込みと読み取り以外のコマンドは、権限モードに関係なく拒否されます。
            </p>
            <WriteScopeEditor project={project} />
          </section>
        )}
        {section === "danger" && <DeleteProject project={project} />}
      </div>
    </div>
  );
}

/** AI の見た目（カードのアイコンと、ログインに使う CLI） */
const PROVIDER_META: Record<ProviderId, { icon: ReactNode; cli: string }> = {
  claude: { icon: <ClaudeMark size={20} />, cli: "claude" },
  codex: { icon: <SquareTerminal size={20} />, cli: "codex" },
  gemini: { icon: <Sparkles size={20} />, cli: "gemini" },
};

/** AI: どの AI を使うか（カード）と、その AI の既定 */
function AiSection({ project, app }: { project: Project; app: AppSettings | undefined }) {
  const providers = useAsync(api.providers);
  const [error, setError] = useState<string>();
  const choose = async (id: ProviderId) => {
    try {
      await api.updateProject(project.id, { provider: id });
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="section">
      <h2>AI</h2>
      <p className="muted small">このプロジェクトのチャットで使う AI です。どれも Mac にインストールした CLI のログインをそのまま使います（API キーは不要）。</p>
      <div className="provider-cards" role="radiogroup" aria-label="使う AI">
        {PROVIDER_IDS.map((id) => (
          <ProviderCard
            key={id}
            id={id}
            status={providers.data?.find((p) => p.id === id)}
            selected={project.provider === id}
            onSelect={() => void choose(id)}
          />
        ))}
      </div>
      {error && <p className="error small">{error}</p>}
      {project.provider === "claude" ? (
        <AiDefaults project={project} app={app} />
      ) : (
        <p className="muted small">この AI の既定の設定は、対応したときにここで選べるようになります。</p>
      )}
    </section>
  );
}

function ProviderCard({
  id,
  status,
  selected,
  onSelect,
}: {
  id: ProviderId;
  status: ProviderStatus | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = PROVIDER_META[id];
  const ready = status?.implemented && status.installed && status.loggedIn;
  const state = !status
    ? { tone: "pending", text: "確認中…" }
    : !status.implemented
      ? { tone: "na", text: status.installed ? "CLI はインストール済み" : "CLI 未インストール" }
      : !status.installed
        ? { tone: "ng", text: "CLI が見つかりません" }
        : status.loggedIn
          ? { tone: "ok", text: "ログイン済み" }
          : { tone: "ng", text: `未ログイン（${meta.cli} でログイン）` };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`provider-card ${selected ? "selected" : ""}`}
      disabled={!status?.implemented}
      title={status?.detail}
      onClick={onSelect}
    >
      <span className="provider-card-head">
        <span className={`provider-icon provider-${id}`}>{meta.icon}</span>
        <span className="provider-name">{status?.label ?? id}</span>
        {selected && <Check size={16} className="provider-check" aria-label="使用中" />}
        {status && !status.implemented && <span className="badge">対応予定</span>}
      </span>
      <span className={`provider-state tone-${state.tone}`}>
        <span className="provider-dot" />
        {state.text}
      </span>
      {ready && (status.account || status.plan) && (
        <span className="provider-account muted">{[status.account, status.plan && `${planLabel(status.plan)} プラン`].filter(Boolean).join(" ・ ")}</span>
      )}
    </button>
  );
}

function BasicInfo({ project }: { project: Project }) {
  const pick = (p: Project) => ({
    name: p.name,
    description: p.description,
    test_command: p.test_command,
    deploy_instructions: p.deploy_instructions,
  });
  const [draft, setDraft] = useState(() => pick(project));
  const save = useSave();
  // 別の画面で変わったときは追従する
  useEffect(() => setDraft(pick(project)), [project]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(project));

  return (
    <section className="section">
      <h2>基本情報</h2>
      <div className="form">
        <label className="field">
          <span className="field-label">プロジェクト名</span>
          <input type="text" value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">概要・アイデア</span>
          <textarea rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <span className="field-help">最初の要件定義のチャットで、AI に渡す出発点になります。</span>
        </label>
        <label className="field">
          <span className="field-label">テストのコマンド</span>
          <input
            type="text"
            value={draft.test_command}
            placeholder="例: npm test"
            onChange={(e) => setDraft({ ...draft, test_command: e.target.value })}
          />
          <span className="field-help">テストのセクションで AI が実行します。空なら AI がリポジトリから判断します。</span>
        </label>
        <label className="field">
          <span className="field-label">デプロイの手順</span>
          <textarea
            rows={3}
            value={draft.deploy_instructions}
            placeholder="例: main に push すると Vercel に自動でデプロイされる"
            onChange={(e) => setDraft({ ...draft, deploy_instructions: e.target.value })}
          />
        </label>
        <div className="form-actions">
          <button
            className="btn btn-primary"
            disabled={!dirty || !draft.name.trim() || save.saving}
            onClick={() => void save.run(() => api.updateProject(project.id, { ...draft, name: draft.name.trim() }))}
          >
            {save.saving ? "保存中…" : "保存"}
          </button>
          {save.message && <span className={save.message.kind === "ok" ? "success" : "error"}>{save.message.text}</span>}
        </div>
      </div>
    </section>
  );
}

function AiDefaults({ project, app }: { project: Project; app: AppSettings | undefined }) {
  const models = useAsync(() => api.models("claude"));
  const [draft, setDraft] = useState<ProjectDefaults>(project.defaults);
  const save = useSave();
  useEffect(() => setDraft(project.defaults), [project.defaults]);

  /** キーを消すと、アプリの設定に従う */
  const set = <K extends keyof ProjectDefaults>(key: K, value: ProjectDefaults[K] | typeof INHERIT) => {
    const next = { ...draft };
    if (value === INHERIT) delete next[key];
    else next[key] = value as ProjectDefaults[K];
    setDraft(next);
  };
  const keys = ["model", "effort", "permission", "fastMode"] as const;
  const dirty = keys.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(project.defaults[k]));
  const list = models.data ?? [];
  const currentModel = list.find((m) => m.value === (draft.model ?? app?.claudeModel));

  // アプリの設定の値（「アプリの設定に従う」の横に出す）
  const appEffort = app ? (app.defaultEffort ? EFFORT_LABELS[app.defaultEffort] : "セクションに合わせる") : "…";
  const appPermission = app ? (app.defaultPermission === "phase" ? "セクションに合わせる" : PERMISSION_LABELS[app.defaultPermission]) : "…";

  return (
    <div className="ai-defaults">
      <h3>Claude Code の既定</h3>
      <p className="muted small">
        このプロジェクトの新しいチャットは、ここで決めた設定から始まります。「アプリの設定に従う」の項目は、設定画面の AI の既定を使います。
      </p>
      <div className="form">
        <label className="field">
          <span className="field-label">モデル</span>
          <select value={draft.model ?? INHERIT} onChange={(e) => set("model", e.target.value)}>
            <option value={INHERIT}>アプリの設定に従う（{app ? modelDisplayName(list, app.claudeModel) : "…"}）</option>
            {draft.model && !list.some((m) => m.value === draft.model) && <option value={draft.model}>{draft.model}</option>}
            {groupModels(list).map((g) => (
              <optgroup key={g.family} label={g.family}>
                {g.items.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.version} — {i.description}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">推論の深さ（effort）</span>
          <select
            value={draft.effort === undefined ? INHERIT : (draft.effort ?? "")}
            onChange={(e) => set("effort", e.target.value === INHERIT ? INHERIT : ((e.target.value || null) as EffortLevel | null))}
          >
            <option value={INHERIT}>アプリの設定に従う（{appEffort}）</option>
            <option value="">セクションに合わせる</option>
            {(currentModel?.efforts ?? EFFORT_LEVELS).map((level) => (
              <option key={level} value={level}>
                {EFFORT_LABELS[level]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">権限モード</span>
          <select value={draft.permission ?? INHERIT} onChange={(e) => set("permission", e.target.value as PermissionChoice | typeof INHERIT)}>
            <option value={INHERIT}>アプリの設定に従う（{appPermission}）</option>
            {PERMISSION_CHOICES.filter((p) => p !== "auto" || !currentModel || currentModel.supportsAutoMode).map((p) => (
              <option key={p} value={p}>
                {p === "phase" ? "セクションに合わせる" : PERMISSION_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">ファストモード</span>
          <select
            value={draft.fastMode === undefined ? INHERIT : draft.fastMode ? "on" : "off"}
            onChange={(e) => set("fastMode", e.target.value === INHERIT ? INHERIT : e.target.value === "on")}
          >
            <option value={INHERIT}>アプリの設定に従う（{app ? (app.defaultFastMode ? "使う" : "使わない") : "…"}）</option>
            <option value="on" disabled={currentModel ? !currentModel.supportsFastMode : false}>
              使う{currentModel && !currentModel.supportsFastMode ? "（このモデルは対応していません）" : ""}
            </option>
            <option value="off">使わない</option>
          </select>
        </label>
        <div className="form-actions">
          <button
            className="btn btn-primary"
            disabled={!dirty || save.saving}
            onClick={() => void save.run(() => api.updateProject(project.id, { defaults: draft }))}
          >
            {save.saving ? "保存中…" : "保存"}
          </button>
          {save.message && <span className={save.message.kind === "ok" ? "success" : "error"}>{save.message.text}</span>}
        </div>
      </div>
    </div>
  );
}

function ChatDefaults({ project }: { project: Project }) {
  const [section, setSection] = useState<Phase | "">(project.defaults.section ?? "");
  const [stage, setStage] = useState<BoardStage | "">(project.defaults.stage ?? "");
  const save = useSave();
  useEffect(() => {
    setSection(project.defaults.section ?? "");
    setStage(project.defaults.stage ?? "");
  }, [project.defaults]);
  const dirty = section !== (project.defaults.section ?? "") || stage !== (project.defaults.stage ?? "");

  const submit = () => {
    // ほかの既定（AI の既定）は残したまま、この 2 つだけ置き換える
    const next: ProjectDefaults = { ...project.defaults };
    if (section) next.section = section;
    else delete next.section;
    if (stage) next.stage = stage;
    else delete next.stage;
    return api.updateProject(project.id, { defaults: next });
  };

  return (
    <section className="section">
      <h2>新しいチャットの既定</h2>
      <div className="form">
        <label className="field">
          <span className="field-label">セクション</span>
          <select value={section} onChange={(e) => setSection(e.target.value as Phase | "")}>
            <option value="">直近のチャットと同じ（はじめは要件定義）</option>
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {SECTION_META[p].label}
              </option>
            ))}
          </select>
          <span className="field-help">新しいチャットの画面で、最初に選ばれているセクションです。</span>
        </label>
        <label className="field">
          <span className="field-label">カンバンの列</span>
          <select value={stage} onChange={(e) => setStage(e.target.value as BoardStage | "")}>
            <option value="">状態に合わせる（作業中は対応中、確認待ちはレビュー）</option>
            {BOARD_STAGES.map((s) => (
              <option key={s} value={s}>
                {BOARD_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <span className="field-help">カンバンの列の＋から作ったチャットは、その列に置かれます。</span>
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" disabled={!dirty || save.saving} onClick={() => void save.run(submit)}>
            {save.saving ? "保存中…" : "保存"}
          </button>
          {save.message && <span className={save.message.kind === "ok" ? "success" : "error"}>{save.message.text}</span>}
        </div>
      </div>
    </section>
  );
}

function DeleteProject({ project }: { project: Project }) {
  const [error, setError] = useState<string>();
  const remove = async () => {
    const ok = await confirmDialog({
      title: `プロジェクト「${project.name}」を削除しますか？`,
      message: `チャット・グループ・タスク・要件定義書などの Kickoff 上の記録は消えます。フォルダとリポジトリ（${project.repo_path}）は削除されません。`,
      confirmLabel: "削除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteProject(project.id);
      navigate({ name: "home" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="section danger-zone">
      <h2>プロジェクトの削除</h2>
      <p className="muted small">
        Kickoff 上の記録（チャット・グループ・タスク・要件定義書など）を消します。フォルダとリポジトリは削除されないので、あとから取り込み直せます。
      </p>
      <button className="btn btn-danger" onClick={() => void remove()}>
        プロジェクトを削除
      </button>
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
