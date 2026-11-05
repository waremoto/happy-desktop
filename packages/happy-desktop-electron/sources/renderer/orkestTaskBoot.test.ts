import { describe, expect, it } from "vitest";
import { orkestTaskBootRead } from "./orkestTaskBoot";

const parseTestTaskId = (value: unknown) =>
    typeof value === "string" && value.length > 0 ? value : undefined;

describe("browser-local Orkest task boot", () => {
    it("captures one opted-in task ID and asks history to start at home", () => {
        expect(orkestTaskBootRead("?taskId=task-7", true, parseTestTaskId)).toEqual({
            initialHandoff: expect.objectContaining({ taskId: "task-7" }),
            forceHome: true,
        });
        const boot = orkestTaskBootRead("?taskId=task-7", true, parseTestTaskId);
        expect(boot.initialHandoff?.consume()).toBe(true);
        expect(boot.initialHandoff?.consume()).toBe(false);
    });

    it.each([
        ["disabled opt-in", "?taskId=task-7", false],
        ["missing ID", "?other=value", true],
        ["empty ID", "?taskId=", true],
        ["duplicate ID", "?taskId=task-7&taskId=task-8", true],
    ] as const)("ignores %s", (_label, search, enabled) => {
        expect(orkestTaskBootRead(search, enabled, parseTestTaskId)).toEqual({
            forceHome: false,
        });
    });
});
