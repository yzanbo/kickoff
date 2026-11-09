import { FolderGit2, FolderInput, FolderSearch, Inbox, LayoutGrid, MessageSquare, Plus } from "lucide-react";
import { href } from "@/app/router";
import { EmptyState } from "@/ui/EmptyState";
import { useVisibleProjects } from "./useVisibleProjects";
import { ProjectMark } from "./ProjectMark";
import { openNewProject } from "./new/openNewProject";

/** 移れる先として並べるプロジェクトの数 */
const LISTED_PROJECTS = 6;

/**
 * 作る（・取り込む）のボタン（新しいプロジェクトのダイアログを、その作り方で開く。取り込むはダイアログの中でも選べる）。
 * onPick: 開く前に呼ぶ（案内のダイアログから押したときに、それを閉じる）
 */
function NewProjectActions({ primary, withImport, onPick }: { primary: boolean; withImport: boolean; onPick?: () => void }) {
  const open = (mode: "create" | "import") => {
    onPick?.();
    openNewProject(mode === "import" ? { mode } : {});
  };
  return (
    <>
      <button type="button" className={primary ? "btn btn-primary" : "btn"} onClick={() => open("create")}>
        <Plus size={15} aria-hidden /> 新しいプロジェクト
      </button>
      {withImport && (
        <button type="button" className="btn" onClick={() => open("import")}>
          <FolderInput size={15} aria-hidden /> 既存のフォルダを取り込む
        </button>
      )}
    </>
  );
}

/** 始め方の 3 段（プロジェクトがまだないときの案内） */
const STEPS = [
  { icon: FolderGit2, title: "プロジェクトを用意する", text: "新しいフォルダを作るか、いまあるフォルダ（リポジトリ）を取り込みます。" },
  { icon: MessageSquare, title: "チャットで頼む", text: "作りたいもの・直したいことを書いて送ると、AI がそのフォルダで作業します。" },
  { icon: Inbox, title: "要対応にまとまる", text: "答えを待っているチャットと、まだ見ていない結果は、サイドバーの「要対応」に集まります。" },
];

/**
 * プロジェクトがまだないときの案内（全プロジェクトの画面・見つからないプロジェクトの画面・新しいチャットを始めようとしたときの案内のダイアログで共通）。
 * Kickoff で何をするか・始め方の 3 段・作る / 取り込むのボタン。archived: しまったプロジェクトの数（あれば「まだない」とは言わず、その旨を添える）。
 * forNewChat: 新しいチャットを始めようとしたとき（すべてのチャットはプロジェクトの中で行うことを先に伝え、作るとそこで新しいチャットが開くと添える）。
 * onPick: 作る・取り込むを押したとき（ダイアログを閉じる）
 */
export function NoProjectsWelcome({ archived = 0, forNewChat = false, onPick }: { archived?: number; forNewChat?: boolean; onPick?: () => void }) {
  return (
    <EmptyState
      icon={forNewChat ? MessageSquare : FolderGit2}
      title={forNewChat ? "チャットはプロジェクトの中で始めます" : archived > 0 ? "表示中のプロジェクトがありません" : "まだプロジェクトがありません"}
      actions={<NewProjectActions primary withImport onPick={onPick} />}
      footer={
        <ol className="empty-state-steps">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title}>
              <span className="empty-state-step-icon">
                <Icon size={16} aria-hidden />
              </span>
              <span className="empty-state-step-body">
                <strong>
                  {i + 1}. {title}
                </strong>
                <span>{text}</span>
              </span>
            </li>
          ))}
        </ol>
      }
    >
      {forNewChat ? (
        <>
          Kickoff では、すべてのチャットをプロジェクト（AI が作業するフォルダ）の中で行います。
          {archived > 0 ? "表示中のプロジェクトがないので、新しく作るか、アーカイブしたプロジェクトを戻してください。" : "まだプロジェクトがないので、先に 1 つ作りましょう。"}
          作ると、そのプロジェクトで新しいチャットが開きます。
        </>
      ) : (
        "Kickoff では、フォルダ 1 つが 1 つのプロジェクトです。プロジェクトを作ると、その中で AI とのチャットを始められます。"
      )}
      {archived > 0 && <p className="empty-state-note">アーカイブしたプロジェクトが {archived} 件あります（サイドバーの見出しの「アーカイブ」で表示して戻せます）。</p>}
    </EmptyState>
  );
}

/**
 * URL のプロジェクトが見つからない（消した・URL の番号が違う）ときの案内。ほかのプロジェクトがあれば、そこへ移れる一覧を添える
 * （サイドバーと同じ並び・しまっていないもの）
 */
export function MissingProject({ id }: { id: number }) {
  const { active } = useVisibleProjects();
  const listed = active.slice(0, LISTED_PROJECTS);
  return (
    <EmptyState
      icon={FolderSearch}
      title="このプロジェクトは見つかりません"
      actions={
        <>
          <a className="btn btn-primary" href={href({ name: "allProjects" })}>
            <LayoutGrid size={15} aria-hidden /> 全プロジェクトへ
          </a>
          <NewProjectActions primary={false} withImport={false} />
        </>
      }
      footer={
        listed.length > 0 && (
          <nav className="empty-state-list" aria-label="ほかのプロジェクト">
            <div className="empty-state-list-head">ほかのプロジェクトを開く</div>
            {listed.map((p) => (
              <a key={p.id} className="empty-state-project" href={href({ name: "project", id: p.id, tab: "board" })}>
                <ProjectMark project={p} />
                <span className="empty-state-project-name">{p.name}</span>
                <span className="empty-state-project-path">{p.repo_path}</span>
              </a>
            ))}
            {active.length > listed.length && (
              <a className="empty-state-more" href={href({ name: "allProjects" })}>
                ほか {active.length - listed.length} 件を全プロジェクトで見る
              </a>
            )}
          </nav>
        )
      }
    >
      削除したか、URL の番号が違うプロジェクトです（ID {id}）。ほかのプロジェクトを開くか、新しく作れます。
    </EmptyState>
  );
}
