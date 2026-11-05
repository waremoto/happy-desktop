import type { OrkestTaskInitialHandoff } from "happy-desktop-app";

export type OrkestTaskIdParser = (value: unknown) => string | undefined;

export interface OrkestTaskBoot {
    /** Stable one-shot handoff captured from an opted-in browser-local URL. */
    readonly initialHandoff?: OrkestTaskInitialHandoff;
    /** A direct handoff takes precedence over this renderer's saved route. */
    readonly forceHome: boolean;
}

/** Read the browser URL once; Electron and ordinary browser-local runs opt out. */
export function orkestTaskBootRead(
    search: string,
    enabled: boolean,
    parseTaskId: OrkestTaskIdParser,
): OrkestTaskBoot {
    if (!enabled) return { forceHome: false };

    const values = new URLSearchParams(search).getAll("taskId");
    if (values.length !== 1) return { forceHome: false };

    const taskId = parseTaskId(values[0]);
    if (taskId === undefined) return { forceHome: false };

    let consumed = false;
    const initialHandoff: OrkestTaskInitialHandoff = {
        taskId,
        get pendingTaskId() {
            return consumed ? undefined : taskId;
        },
        consume() {
            if (consumed) return false;
            consumed = true;
            return true;
        },
    };
    return { initialHandoff, forceHome: true };
}
