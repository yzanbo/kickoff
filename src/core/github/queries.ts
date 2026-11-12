// GitHub タブが GitHub に聞く GraphQL（一覧・絞り込みの候補・issue / PR の中身）。答えの形は normalize.ts が API の形にする

const USER = "login avatarUrl";

const ITEM_COMMON = `number title state url createdAt updatedAt closedAt
  author { ${USER} }
  labels(first: 20) { nodes { name color } }
  assignees(first: 10) { nodes { ${USER} } }
  milestone { title }
  comments { totalCount }`;

/** 一覧の 1 件（issue と PR） */
export const ITEM_FIELDS = `
  __typename
  ... on Issue { ${ITEM_COMMON} stateReason }
  ... on PullRequest { ${ITEM_COMMON} isDraft reviewDecision headRefName baseRefName
    commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }`;

/** 一覧（GitHub の検索。q は @shared/github/searchQuery で作る） */
export const SEARCH_QUERY = `query($q: String!, $first: Int!, $after: String) {
  search(query: $q, type: ISSUE, first: $first, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ${ITEM_FIELDS} }
  }
}`;

/** 絞り込みの候補（ラベル・開いているマイルストーン・担当にできる人）と、使っているアカウント */
export const META_QUERY = `query($owner: String!, $name: String!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    labels(first: 100, orderBy: { field: NAME, direction: ASC }) { nodes { name color } }
    milestones(first: 50, states: OPEN, orderBy: { field: DUE_DATE, direction: ASC }) { nodes { title } }
    assignableUsers(first: 100) { nodes { ${USER} } }
  }
}`;

/** 使っているアカウント（連携の状態の確かめ） */
export const VIEWER_QUERY = `query { viewer { login } }`;

const ACTOR = `actor { ${USER} }`;

/** issue と PR に共通の出来事（timelineItems の itemTypes。issue と PR で型の名前は同じ） */
const COMMON_EVENT_TYPES = [
  "ISSUE_COMMENT",
  "LABELED_EVENT",
  "UNLABELED_EVENT",
  "ASSIGNED_EVENT",
  "UNASSIGNED_EVENT",
  "CLOSED_EVENT",
  "REOPENED_EVENT",
  "CROSS_REFERENCED_EVENT",
  "RENAMED_TITLE_EVENT",
  "MILESTONED_EVENT",
  "DEMILESTONED_EVENT",
];
const PR_EVENT_TYPES = [
  "PULL_REQUEST_REVIEW",
  "PULL_REQUEST_COMMIT",
  "MERGED_EVENT",
  "REVIEW_REQUESTED_EVENT",
  "HEAD_REF_FORCE_PUSHED_EVENT",
  "READY_FOR_REVIEW_EVENT",
  "CONVERT_TO_DRAFT_EVENT",
];

const EVENT_FIELDS = `
  __typename
  ... on IssueComment { id author { ${USER} } createdAt body bodyHTML url }
  ... on LabeledEvent { id ${ACTOR} createdAt label { name } }
  ... on UnlabeledEvent { id ${ACTOR} createdAt label { name } }
  ... on AssignedEvent { id ${ACTOR} createdAt assignee { ... on User { login } ... on Bot { login } ... on Mannequin { login } } }
  ... on UnassignedEvent { id ${ACTOR} createdAt assignee { ... on User { login } ... on Bot { login } ... on Mannequin { login } } }
  ... on ClosedEvent { id ${ACTOR} createdAt stateReason }
  ... on ReopenedEvent { id ${ACTOR} createdAt }
  ... on CrossReferencedEvent { id ${ACTOR} createdAt source { ... on Issue { number title } ... on PullRequest { number title } } }
  ... on RenamedTitleEvent { id ${ACTOR} createdAt previousTitle currentTitle }
  ... on MilestonedEvent { id ${ACTOR} createdAt milestoneTitle }
  ... on DemilestonedEvent { id ${ACTOR} createdAt milestoneTitle }`;

const PR_EVENT_FIELDS = `
  ... on PullRequestReview { id author { ${USER} } createdAt state body bodyHTML }
  ... on PullRequestCommit { id commit { oid messageHeadline committedDate author { name user { ${USER} } } } }
  ... on MergedEvent { id ${ACTOR} createdAt mergeRefName commit { abbreviatedOid } }
  ... on ReviewRequestedEvent { id ${ACTOR} createdAt requestedReviewer { ... on User { login } ... on Team { name } ... on Bot { login } } }
  ... on HeadRefForcePushedEvent { id ${ACTOR} createdAt }
  ... on ReadyForReviewEvent { id ${ACTOR} createdAt }
  ... on ConvertToDraftEvent { id ${ACTOR} createdAt }`;

/** 自分にできること（閉じる・開き直す・ラベル） */
const VIEWER_CAN = "viewerCanClose viewerCanReopen viewerCanLabel";

/** 出来事を読む 1 回の数（3 回まで続きを読む） */
export const TIMELINE_PAGE = 100;
export const TIMELINE_MAX_PAGES = 3;

const timeline = (types: string[], fields: string) =>
  `timelineItems(first: ${TIMELINE_PAGE}, after: $after, itemTypes: [${types.join(", ")}]) { pageInfo { hasNextPage endCursor } nodes { ${fields} } }`;

/** issue か PR の中身（番号から。PR は行のスレッドとチェックも） */
export const DETAIL_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed viewerPermission
    issueOrPullRequest(number: $number) {
      ${ITEM_FIELDS}
      ... on Issue { body bodyHTML ${VIEWER_CAN} ${timeline(COMMON_EVENT_TYPES, EVENT_FIELDS)} }
      ... on PullRequest {
        body bodyHTML ${VIEWER_CAN} additions deletions changedFiles mergeable mergeStateStatus headRefOid headRepositoryOwner { login }
        ${timeline([...COMMON_EVENT_TYPES, ...PR_EVENT_TYPES], EVENT_FIELDS + PR_EVENT_FIELDS)}
        reviewThreads(first: 100) { nodes { id path line originalLine diffSide isResolved isOutdated viewerCanReply viewerCanResolve viewerCanUnresolve
          comments(first: 50) { nodes { id author { ${USER} } createdAt body bodyHTML diffHunk url pullRequestReview { id } } } } }
        statusCommits: commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes {
          __typename
          ... on CheckRun { name status conclusion detailsUrl title checkSuite { workflowRun { workflow { name } } } }
          ... on StatusContext { context state targetUrl description } } } } } } }
      }
    }
  }
}`;

/** 中身の出来事の続き（2 回目から。timeline だけを読む） */
export const TIMELINE_MORE_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issueOrPullRequest(number: $number) {
      __typename
      ... on Issue { ${timeline(COMMON_EVENT_TYPES, EVENT_FIELDS)} }
      ... on PullRequest { ${timeline([...COMMON_EVENT_TYPES, ...PR_EVENT_TYPES], EVENT_FIELDS + PR_EVENT_FIELDS)} }
    }
  }
}`;

/** 行のスレッドに返信する（段階 3。返信・解決は人がする） */
export const THREAD_REPLY_MUTATION = `mutation($thread: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $thread, body: $body }) { comment { id } }
}`;

/** 行のスレッドを解決済みにする / 戻す */
export const RESOLVE_THREAD_MUTATION = `mutation($thread: ID!) { resolveReviewThread(input: { threadId: $thread }) { thread { isResolved } } }`;
export const UNRESOLVE_THREAD_MUTATION = `mutation($thread: ID!) { unresolveReviewThread(input: { threadId: $thread }) { thread { isResolved } } }`;
