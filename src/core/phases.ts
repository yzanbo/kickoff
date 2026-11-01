import { DEFAULT_WRITE_SCOPE } from "./scope.js";
import { SECTION_DEFAULT_EFFORT, SECTION_DEFAULT_PERMISSION } from "./sectionDefaults.js";
import { PHASE_LABELS, type Phase, type Project, type Task } from "./types.js";

/**
 * セクションごとのエージェントの権限ポリシー（プロバイダー非依存）。
 * 各プロバイダーはこれを自分の権限設定（Claude なら allowedTools / permissionMode）に変換する。
 */
export interface PhasePolicy {
  phase: Phase;
  /** ファイルの作成・編集を承認なしで許可するか */
  autoEdit: boolean;
  /** 承認なしで実行してよいシェルコマンドの接頭辞 */
  allowedCommands: string[];
  /** Web 検索・取得を承認なしで許可するか */
  web: boolean;
  /** 推論の深さ */
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * 書き込みできるフォルダ（cwd からの相対パス）。指定があると、権限モードに関係なく
   * 範囲外への書き込みと読み取り以外のシェルコマンドを必ず拒否する。
   */
  writeScope?: string[];
}

/** プロジェクトに設定された書き込みできるフォルダ（未設定なら docs） */
export function writeScopeOf(project: Project, section: "requirements" | "schedule"): string[] {
  return project.write_scopes[section] ?? DEFAULT_WRITE_SCOPE;
}

const GIT_READ = ["git status", "git diff", "git log", "git show", "git branch"];
const CHECK_COMMANDS = [
  "npm test",
  "npm run test",
  "npm run lint",
  "npm run typecheck",
  "npm run build",
  "pnpm test",
  "pnpm run test",
  "pnpm run lint",
  "pnpm run typecheck",
  "pnpm run build",
  "npx tsc",
  "npx vitest run",
  "pytest",
  "python -m pytest",
  "go test",
  "cargo test",
];

/** 既定の権限モードが「編集を自動承認」のセクションか（autoEdit と同じ意味） */
export const sectionAutoEdit = (phase: Phase) => SECTION_DEFAULT_PERMISSION[phase] === "acceptEdits";

export function phasePolicy(phase: Phase, project: Project): PhasePolicy {
  const testCommand = project.test_command.trim();
  const withTest = (cmds: string[]) => (testCommand ? [...cmds, testCommand] : cmds);

  switch (phase) {
    case "requirements":
      return { phase, autoEdit: false, allowedCommands: GIT_READ, web: true, effort: SECTION_DEFAULT_EFFORT[phase], writeScope: writeScopeOf(project, phase) };
    case "schedule":
      return { phase, autoEdit: false, allowedCommands: GIT_READ, web: false, effort: SECTION_DEFAULT_EFFORT[phase], writeScope: writeScopeOf(project, phase) };
    case "implementation":
      return {
        phase,
        autoEdit: true,
        allowedCommands: withTest([
          ...GIT_READ,
          ...CHECK_COMMANDS,
          ...(project.auto_commit ? ["git add", "git commit"] : []),
        ]),
        web: true,
        effort: SECTION_DEFAULT_EFFORT[phase],
      };
    case "testing":
      return { phase, autoEdit: true, allowedCommands: withTest([...GIT_READ, ...CHECK_COMMANDS]), web: false, effort: SECTION_DEFAULT_EFFORT[phase] };
    case "deployment":
      // デプロイは外部に影響するため、読み取り以外のコマンドはすべて承認制
      return { phase, autoEdit: false, allowedCommands: GIT_READ, web: true, effort: SECTION_DEFAULT_EFFORT[phase] };
  }
}

const PHASE_INSTRUCTIONS: Record<Phase, string> = {
  requirements: `## あなたの役割: 要件定義
ユーザーとチャットしながら、作るものを明確にして要件定義書にまとめます。

- 判断が分かれる点や、推測で埋めると手戻りが大きい点は AskUserQuestion でユーザーに確認してください。一度に聞くのは重要なものから数問にとどめ、自明な点まで聞く必要はありません。
- 要件定義書は mcp__kickoff__save_artifact（kind: "requirements", export_path: 書き込みできるフォルダ内の requirements.md。例: "docs/requirements.md"）で保存します。既存の要件定義書があれば先に読み、変更点を反映した全文で保存し直してください。
- 構成の目安: 背景と目的 / 利用者 / スコープ（やること・やらないこと）/ 機能要件 / 非機能要件 / 技術スタック（選定理由つき）/ デプロイ先・リリース方法 / 受け入れ基準 / 未決事項。
- 技術スタックとデプロイ先は、要件に合わせて提案し、ユーザーの同意を得てから要件定義書に書いてください。
- ユーザーにタスク分解を頼まれたら、mcp__kickoff__create_task でタスクを起票します。1 タスクは 1 回のエージェント実行で完了できる粒度にし、内容・受け入れ基準を具体的に書いてください。コードや雛形がまだなければ最初のタスクを「雛形の作成」にします。実装だけでなく、テスト・デプロイのタスクも起票してください。起票前に mcp__kickoff__list_tasks で重複を確認します。
- このセクションではプロダクトコードを変更しません。`,

  schedule: `## あなたの役割: スケジュール
ユーザーとチャットしながら、開発の予定（マイルストーン・予定日・進め方）を立てて管理します。

- 要件定義書（mcp__kickoff__list_artifacts / get_artifact、または docs/requirements.md）とタスク（mcp__kickoff__list_tasks）を読んで、現状を把握してから提案してください。
- 使える時間（1 日・1 週間あたり）や締め切りなど、予定を立てるのに必要な情報が分からなければ AskUserQuestion で確認してください。
- タスクごとの所要時間の目安、依存関係、マイルストーン（例: 動く最小版・公開）と予定日を提案します。
- まとまったら mcp__kickoff__save_artifact（kind: "schedule", export_path: 書き込みできるフォルダ内の schedule.md。例: "docs/schedule.md"）で保存します。既存のスケジュールがあれば先に読み、進み具合を反映して更新してください。
- タスクの優先度を変えたほうがよい場合は、理由を説明してから mcp__kickoff__update_task で変更します（ステータスは変えません）。
- このセクションではプロダクトコードを変更しません。`,

  implementation: `## あなたの役割: 実装
割り当てられたタスクを実装します。

- 着手前に docs/requirements.md（あれば）と関連コードを読み、既存の設計・命名・スタイルに合わせてください。
- 変更はタスクの範囲に絞ります。途中で見つけた別の作業は mcp__kickoff__create_task で起票し、今のタスクには含めないでください。
- 必要に応じてテストを追加し、ビルド・型チェック・テストを実行して動作を確認してから完了にしてください。
- 完了したら mcp__kickoff__update_task でタスクを status: "review" にし、summary に変更内容と確認結果を簡潔に書きます。完了できなかった場合は status: "blocked" にして理由を書きます。`,

  testing: `## あなたの役割: テスト
要件定義書の受け入れ基準と実装済みのタスクに対して、テストを作成・実行して品質を確認します。

- docs/requirements.md と mcp__kickoff__list_tasks（phase: "implementation"）で対象を把握してください。
- テストコードの追加・修正は行ってよいですが、プロダクトコードは修正しません。不具合を見つけたら mcp__kickoff__create_task で実装（phase: "implementation"）に「[バグ] 〜」として起票し、再現手順と期待結果を書いてください。
- 結果は mcp__kickoff__save_artifact（kind: "test_report", export_path: "docs/test-report.md"）で保存します。実行したコマンド、結果の要約、失敗の詳細、起票したバグを含めてください。
- 最後に担当タスクを mcp__kickoff__update_task で更新します（すべて合格なら "review"、問題があれば "blocked"）。`,

  deployment: `## あなたの役割: デプロイ
プロジェクトに設定されたデプロイ手順に従ってデプロイします。

- 事前チェック: 未コミットの変更がないこと、テストが通っていることを確認し、問題があれば中止して報告してください。
- デプロイ手順が設定されていない場合は、リポジトリを調べてデプロイ方法を提案し、AskUserQuestion で確認してから進めてください。
- コマンドの実行はすべてユーザーの承認を経ます。承認を求める前に、そのコマンドが何をするかを一言説明してください。
- 結果は mcp__kickoff__save_artifact（kind: "deploy_log"）で保存します。実行したコマンド、デプロイ先 URL、確認結果、ロールバック方法を含めてください。
- 最後に担当タスクを mcp__kickoff__update_task で更新します。`,
};

/** プロバイダーのシステムプロンプトに追記するプロジェクト文脈 */
export function buildSystemPrompt(project: Project, phase: Phase, task: Task | null): string {
  const lines = [
    `# Kickoff からの指示`,
    `あなたはローカルのプロジェクト管理アプリ「Kickoff」から起動されたエージェントです。プロジェクトのタスクと成果物は mcp__kickoff__ で始まるツールで読み書きします。ユーザーへの返答と成果物は日本語で書いてください。`,
    ``,
    `## プロジェクト`,
    `- 名前: ${project.name}`,
    `- リポジトリ: ${project.repo_path}`,
    `- このチャットのセクション: ${PHASE_LABELS[phase]}`,
  ];
  if (project.description.trim()) lines.push(`- 概要:\n${indent(project.description.trim())}`);
  if (project.test_command.trim()) lines.push(`- テストコマンド: \`${project.test_command.trim()}\``);
  if (phase === "deployment") {
    lines.push(
      project.deploy_instructions.trim()
        ? `- デプロイ手順:\n${indent(project.deploy_instructions.trim())}`
        : `- デプロイ手順: 未設定`,
    );
  }
  if (phase === "implementation" && project.auto_commit) {
    lines.push(
      `- コミット: リポジトリが git 管理されていれば、タスク完了時に変更をコミットしてください（メッセージ例: "[Kickoff #<タスクID>] <要約>"）。`,
    );
  }

  if (phase === "requirements" || phase === "schedule") {
    const scope = writeScopeOf(project, phase);
    lines.push(
      scope.length
        ? `- 書き込みできるフォルダ: ${scope.map((s) => `${s}/`).join("、")}（それ以外への書き込みと、読み取り以外のシェルコマンドは拒否されます。成果物の export_path もこの中にしてください）`
        : `- このセクションではファイルを書き込めません（成果物は export_path なしで保存してください）`,
    );
  }

  if (task) {
    lines.push(``, `## 担当タスク (#${task.id})`, `- タイトル: ${task.title}`);
    if (task.description.trim()) lines.push(`- 内容:\n${indent(task.description.trim())}`);
    if (task.acceptance_criteria.trim()) lines.push(`- 受け入れ基準:\n${indent(task.acceptance_criteria.trim())}`);
  }

  lines.push(``, PHASE_INSTRUCTIONS[phase]);
  return lines.join("\n");
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}
