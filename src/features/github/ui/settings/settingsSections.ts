// github がプロジェクトの設定（設定の節 scope: "project"）に出す節: GitHub（使うアカウント・連携先・PR と CI の見張り）
import { GitPullRequest } from "lucide-react";
import type { SettingsSectionDef } from "@/features/settings/ui";
import { GitHubSection } from "./GitHubSection";

export const githubSettingsSection: SettingsSectionDef = { id: "github", scope: "project", label: "GitHub", icon: GitPullRequest, order: 40, Component: GitHubSection };
