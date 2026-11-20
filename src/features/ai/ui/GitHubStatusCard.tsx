import type { GitHubStatus } from "@shared/foundation/server";
import { StatusCard } from "@/foundation/ui/kit/StatusCard";

/** GitHub CLI（gh）の状態（確かめた結果の店は ./stores/providers.ts の githubStore） */
export function GitHubStatusCard({ github }: { github: { loading: boolean; data?: GitHubStatus; error?: string } }) {
  return <StatusCard title="GitHub CLI（gh）" ok={github.loading ? undefined : Boolean(github.data?.logged_in)} detail={github.error ?? github.data?.detail ?? "確認中…"} />;
}
