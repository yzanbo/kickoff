// github がプロジェクトの画面の表（projectViews）に出す画面: GitHub（連携先の issue・PR）と CI（GitHub Actions の実行）。どちらもこの Mac のアプリの中だけ
import { GitPullRequest, Workflow } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
import { CiViewPage, GitHubViewPage } from "./projectViewPages";

export const githubView: ProjectViewDef = {
  id: "github",
  label: "GitHub",
  icon: GitPullRequest,
  group: "github",
  order: 100,
  desktopOnly: true,
  places: ["center", "rightSidebar", "chatSide"],
  chatSide: { hint: () => "GitHub（このプロジェクトの連携先の issue・PR）", about: "issue・PR の一覧と中身", bare: true },
  Page: GitHubViewPage,
};

export const ciView: ProjectViewDef = {
  id: "ci",
  label: "CI",
  tip: "CI の結果",
  icon: Workflow,
  group: "ci",
  order: 110,
  desktopOnly: true,
  places: ["center", "rightSidebar", "chatSide"],
  chatSide: { hint: () => "CI の結果（このプロジェクトの GitHub Actions の実行）", about: "GitHub Actions の実行の一覧とログ", bare: true },
  Page: CiViewPage,
};
