import type { Project, ProjectPatch } from "@shared/types";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { useAsync } from "@/hooks/useAsync";
import { CheckField, Field } from "@/ui/Field";
import { ErrorText } from "@/ui/ErrorText";

/** 「自動」「gh で有効なもの」を表す select の値 */
const AUTO = "";

/**
 * GitHub: このプロジェクトで使う GitHub のアカウントと連携先のリポジトリ、ワークツリーの PR を見張るか（変えたらその場で保存）。
 * アカウントは gh に入っているもの（gh の有効なアカウントは切り替えず、このプロジェクトの操作の間だけ使う）、連携先は GitHub の remote から選ぶ
 * （自動 = gh repo set-default → upstream → origin。remote が 1 つなら選ぶものはないので見せるだけ）
 */
export function GitHubSection({ project }: { project: Project }) {
  // 保存したら、自動の連携先を見せ直すため取り直す
  const github = useAsync(() => api.projectGitHub(project.id), [project.id, project.github_remote, project.github_account]);
  const { error, guard } = useAction();
  const save = (patch: ProjectPatch) => guard(() => api.updateProject(project.id, patch));
  const data = github.data;
  const active = data?.accounts.find((a) => a.active);
  // 選んでいるアカウントが gh からなくなっていても、選んでいることが分かるように残す
  const missingAccount = project.github_account && data && !data.accounts.some((a) => a.login === project.github_account) ? project.github_account : null;
  const autoRemote = data?.remotes.find((r) => r.name === data.auto_remote);

  return (
    <section className="section">
      <h2>GitHub</h2>
      <p className="muted small">
        このプロジェクトで使う GitHub のアカウントと連携先のリポジトリです。PR の作成・状態の表示・ワークツリーの PR の見張りと、Kickoff と AI が動かす gh・git（プッシュ・プル）に使います。
      </p>
      {github.loading && !data && <p className="muted small">確認中…</p>}
      <ErrorText message={github.error} />
      {data && (
        <>
          <Field
            label="連携先のリポジトリ"
            help={
              data.remotes.length > 1
                ? "自動では gh repo set-default で決めたもの → upstream → origin の順に選びます（fork なら元のリポジトリに PR を出します）。"
                : undefined
            }
          >
            {data.remotes.length === 0 ? (
              <span className="muted small">GitHub の remote がありません（git remote に GitHub の URL を足すと使えます）。</span>
            ) : data.remotes.length === 1 ? (
              <span>
                {data.remotes[0].repo}（{data.remotes[0].name}）
              </span>
            ) : (
              <select value={project.github_remote ?? AUTO} onChange={(e) => void save({ github_remote: e.target.value || null })}>
                <option value={AUTO}>自動（{autoRemote ? `${autoRemote.repo}・${autoRemote.name}` : "なし"}）</option>
                {data.remotes.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.repo}（{r.name}）
                  </option>
                ))}
                {project.github_remote && !data.remotes.some((r) => r.name === project.github_remote) && (
                  <option value={project.github_remote}>{project.github_remote}（もうない remote。自動で選びます）</option>
                )}
              </select>
            )}
          </Field>
          <Field
            label="アカウント"
            help="gh に入っているアカウントから選びます。gh の有効なアカウントは切り替えず、このプロジェクトの操作の間だけ使います。足すときはターミナルで gh auth login を実行してください。"
          >
            {data.accounts.length === 0 ? (
              <span className="muted small">gh にログインしていません。ターミナルで gh auth login を実行してください。</span>
            ) : (
              <select value={project.github_account ?? AUTO} onChange={(e) => void save({ github_account: e.target.value || null })}>
                <option value={AUTO}>gh で有効なアカウント（{active?.login ?? "なし"}）</option>
                {data.accounts.map((a) => (
                  <option key={a.login} value={a.login}>
                    {a.login}
                    {a.ok ? "" : "（ログインし直しが必要）"}
                  </option>
                ))}
                {missingAccount && <option value={missingAccount}>{missingAccount}（gh にありません）</option>}
              </select>
            )}
          </Field>
          {data.repo && <p className="muted small">いまの連携先: {data.repo}</p>}
        </>
      )}
      <CheckField
        label="ワークツリーの PR を見張る"
        help="ワークツリーのブランチの PR が GitHub でマージされた・マージせずに閉じられたら知らせ、片付けを聞きます（5 分ごとと、Kickoff の窓に戻ったとき）。"
        checked={project.pr_watch}
        onChange={(checked) => void save({ pr_watch: checked })}
      />
      <CheckField
        label="CI の失敗を知らせる"
        help="作業場所（本体・各ワークツリー）でいま取り出しているブランチと既定のブランチ（main など）で GitHub Actions の実行が落ちたら、Mac の通知で知らせます（PR の見張りと同じく 5 分ごとと、Kickoff の窓に戻ったとき。出し方は設定の「通知」に従います）。ほかの人のブランチは知らせません。"
        checked={project.ci_watch}
        onChange={(checked) => void save({ ci_watch: checked })}
      />
      <ErrorText message={error} />
    </section>
  );
}
