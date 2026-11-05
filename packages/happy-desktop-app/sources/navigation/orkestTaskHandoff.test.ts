import { describe, expect, it } from "vitest";
import type { HappyAgentSessionListSnapshot, HappyAgentTask } from "happy-desktop-state";
import {
    orkestTaskHandoffResolve,
    orkestTaskHandoffSearch,
    orkestTaskIdParse,
} from "./orkestTaskHandoff";

const task = {
    id: "orkest-task-1",
    workspaceId: "workspace-1",
    conversation: { id: "conversation-1" },
} as HappyAgentTask;

const readyCatalog = (tasks: readonly HappyAgentTask[] = [task]) =>
    ({
        projects: { type: "ready", value: [] },
        tasks,
        taskDirectory: [],
        tasksArchived: [],
    }) as unknown as HappyAgentSessionListSnapshot;

describe("Orkest native task handoff", () => {
    it("accepts one explicit task query value and rejects empty or malformed values", () => {
        expect(orkestTaskIdParse("orkest-task-1")).toBe("orkest-task-1");
        expect(orkestTaskHandoffSearch("orkest-task-1")).toEqual({ taskId: "orkest-task-1" });
        expect(orkestTaskHandoffSearch(" ")).toEqual({});
        expect(orkestTaskHandoffSearch(["orkest-task-1"])).toEqual({});
        expect(orkestTaskIdParse(" orkest-task-1")).toBeUndefined();
        expect(orkestTaskIdParse("orkest-task-1\u0000")).toBeUndefined();
        expect(orkestTaskIdParse("orkest-task-1\u0085")).toBeUndefined();
        expect(orkestTaskIdParse("x".repeat(257))).toBeUndefined();
        expect(orkestTaskIdParse(undefined)).toBeUndefined();
    });

    it("opens only the exact task in the selected connected catalog", () => {
        expect(orkestTaskHandoffResolve("orkest-task-1", "connected", readyCatalog())).toEqual({
            status: "found",
            taskId: "orkest-task-1",
            location: { groupId: "workspace-1", sessionId: "conversation-1" },
        });
        expect(orkestTaskHandoffResolve("other-agent-task", "connected", readyCatalog())).toEqual({
            status: "notFound",
            taskId: "other-agent-task",
        });
    });

    it("finds a task in the archived catalog without deriving its route", () => {
        const catalog = {
            ...readyCatalog([]),
            tasksArchived: [task],
        } as HappyAgentSessionListSnapshot;
        expect(orkestTaskHandoffResolve("orkest-task-1", "connected", catalog)).toMatchObject({
            status: "found",
            location: { groupId: "workspace-1", sessionId: "conversation-1" },
        });
    });

    it("reports loading, disconnection, catalog failure, and a genuine miss distinctly", () => {
        expect(orkestTaskHandoffResolve("task", "connecting", undefined)).toEqual({
            status: "loading",
            taskId: "task",
        });
        expect(orkestTaskHandoffResolve("task", "connected", undefined)).toEqual({
            status: "loading",
            taskId: "task",
        });
        expect(orkestTaskHandoffResolve("task", "disconnected", undefined)).toEqual({
            status: "disconnected",
            taskId: "task",
        });
        expect(
            orkestTaskHandoffResolve("task", "connected", {
                ...readyCatalog([]),
                projects: { type: "error", error: { message: "offline" } },
            } as unknown as HappyAgentSessionListSnapshot),
        ).toEqual({ status: "unavailable", taskId: "task" });
        expect(orkestTaskHandoffResolve("task", "connected", readyCatalog([]))).toEqual({
            status: "notFound",
            taskId: "task",
        });
        expect(orkestTaskHandoffResolve(undefined, "connected", readyCatalog())).toEqual({
            status: "none",
        });
    });
});
