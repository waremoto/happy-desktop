export type OrkestTaskIdParser = (value: unknown) => string | undefined;

export interface OrkestTaskBoot {
    /** One validated task ID captured from an opted-in browser-local URL. */
    readonly taskId?: string;
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
    return taskId === undefined ? { forceHome: false } : { taskId, forceHome: true };
}
