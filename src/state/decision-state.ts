/** One canonical state every adapter, the harness, and replay share. */
export interface DecisionState {
  /** The original user requirement the agent is working from. */
  requirement: RequirementContext;
  /** Workspace facts: files, paths, branch, dirty state. */
  workspace: WorkspaceContext;
  /** Which agent is proposing, and what it claims. */
  agent: AgentContext;
  /** The concrete action proposed for execution. */
  action: ProposedAction;
  /** Exact changes, when the action mutates content. */
  changes?: ChangeSet;
  /** Prior firewall decisions for this session. */
  history?: ActionHistory;
  /** Environment facts (env vars of interest, cwd, platform). */
  environment?: EnvironmentContext;
}

export interface RequirementContext {
  /** Verbatim user requirement. */
  text: string;
  /** Optional user-supplied constraints ("only touch src/"). */
  constraints?: string[];
  /** Stable id tying a session of actions to one requirement. */
  requirementId?: string;
}

export interface WorkspaceContext {
  root: string;
  /** Files the agent is allowed to touch for this requirement. */
  allowedPaths?: string[];
  /** Current branch, for git-scoped actions. */
  branch?: string;
  /** Files with uncommitted modifications. */
  dirtyPaths?: string[];
}

export interface AgentContext {
  /** Agent identifier, e.g. "claude-code". */
  name: string;
  /** The agent's own explanation of why it proposes this action. */
  explanation?: string;
  /** Session/run id for replay and history grouping. */
  sessionId?: string;
}

export type ActionKind =
  | "file_write"
  | "file_delete"
  | "file_move"
  | "shell"
  | "git"
  | "network"
  | "deploy"
  | "unknown";

export interface ProposedAction {
  kind: ActionKind;
  /** Short human summary, e.g. "edit README typo". */
  summary: string;
  /** Machine target: path, command, URL, or free-form payload. */
  target?: string;
  /** Structured arguments the executor would receive. */
  args?: Record<string, unknown>;
}

export interface ChangeSet {
  /** Unified diffs, keyed by path. */
  diffs: Record<string, string>;
  /** Absolute paths added / modified / deleted. */
  added?: string[];
  modified?: string[];
  deleted?: string[];
}

export interface ActionHistory {
  /** Previously approved decisions in this session. */
  priorActions?: Array<{ summary: string; decision: "ALLOW" | "ASK" | "BLOCK" }>;
}

export interface EnvironmentContext {
  /** Redacted env vars relevant to the action (e.g. NODE_ENV). */
  relevantEnv?: Record<string, string>;
  cwd?: string;
  platform?: string;
}
