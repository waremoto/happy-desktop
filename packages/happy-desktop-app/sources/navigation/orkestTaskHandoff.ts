import type {
    HappyAgentGroupId,
    HappyAgentSessionId,
    HappyAgentSessionListSnapshot,
    HappyAgentSessionLocation,
    HappyAgentTask,
} from "happy-desktop-state";

export type OrkestTaskHandoffAgentStatus =
    | "connecting"
    | "connected"
    | "disconnected"
    | "error"
    | undefined;

export type OrkestTaskHandoffResolution =
    | { readonly status: "none" }
    | { readonly status: "loading"; readonly taskId: string }
    | { readonly status: "disconnected"; readonly taskId: string }
    | { readonly status: "unavailable"; readonly taskId: string }
    | { readonly status: "notFound"; readonly taskId: string }
    | {
          readonly status: "found";
          readonly taskId: string;
          readonly location: HappyAgentSessionLocation;
      };

/** A query value is an ID only when it is one nonempty, trimmed value. */
export function orkestTaskIdParse(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 && value.trim() === value
        ? value
        : undefined;
}

/** Resolve only in the explicitly addressed Happy Agent's catalog. */
export function orkestTaskHandoffResolve(
    taskId: string | undefined,
    agentStatus: OrkestTaskHandoffAgentStatus,
    catalog: HappyAgentSessionListSnapshot | undefined,
): OrkestTaskHandoffResolution {
    if (taskId === undefined) return { status: "none" };
    if (agentStatus === undefined) return { status: "unavailable", taskId };
    if (agentStatus === "connecting" || (agentStatus === "connected" && catalog === undefined))
        return { status: "loading", taskId };
    if (agentStatus !== "connected") return { status: "disconnected", taskId };
    if (
        catalog === undefined ||
        catalog.projects.type === "unloaded" ||
        catalog.projects.type === "loading"
    )
        return { status: "loading", taskId };
    if (catalog.projects.type === "error") return { status: "unavailable", taskId };

    const task = [...catalog.tasks, ...catalog.taskDirectory, ...catalog.tasksArchived].find(
        (candidate) => candidate.id === taskId,
    );
    if (task === undefined) return { status: "notFound", taskId };
    return {
        status: "found",
        taskId,
        location: orkestTaskHandoffLocation(task),
    };
}

/** Build the URL search object for a renderer-only Orkest task handoff. */
export function orkestTaskHandoffSearch(value: unknown): { readonly taskId?: string } {
    const taskId = orkestTaskIdParse(value);
    return taskId === undefined ? {} : { taskId };
}

/** Keep the route address derived from the real task and conversation records. */
export function orkestTaskHandoffLocation(task: HappyAgentTask): HappyAgentSessionLocation {
    return {
        groupId: task.workspaceId as unknown as HappyAgentGroupId,
        sessionId: task.conversation.id as HappyAgentSessionId,
    };
}
