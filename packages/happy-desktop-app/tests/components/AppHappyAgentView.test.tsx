import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import type {
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentHost,
    HappyAgentModelStore,
    HappyAgentPanelSnapshot,
    HappyAgentPanelStore,
    HappyAgentPanelTabId,
    HappyAgentTask,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import {
    appearanceStoreCreate,
    happyAgentGroupAccessRefused,
    HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
    happyAgentHostNoop,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
} from "happy-desktop-state";
import {
    workspaceCloseTargetFind,
    AppHappyAgentView,
    type AppHappyAgentDirectorySnapshot,
    type AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";
import type { OrkestTaskInitialHandoff } from "../../sources/navigation/orkestTaskHandoff";

/* The local workspace renders the shared cloud components with local product
 * state. These tests pin the parts of that contract the app layer owns: which
 * shared component it composes and which props it supplies. The stores are
 * inert stubs because this boundary is a pure projection — no store here starts
 * transport, timers, or authentication work. */

/* `useSyncExternalStore` requires a cached snapshot, so every stub `get()`
 * returns one stable object rather than a fresh literal per call. */
const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;

function connection(): HappyAgentConnectionStore {
    return {
        get: () => CONNECTED,
        subscribe: () => () => undefined,
        retry: () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentConnectionStore;
}

function clock(): HappyAgentClockStore {
    return {
        get: () => 1_764_000_000_000,
        subscribe: () => () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentClockStore;
}

/* The right panel starts hidden, so these projections render the workspace
 * without it and never reach a terminal. */
const PANEL_CLOSED = { open: false, tabs: [] } as const;

function panel(): HappyAgentPanelStore {
    return {
        get: () => PANEL_CLOSED,
        subscribe: () => () => undefined,
        panelToggle: () => undefined,
        terminalAdd: () => undefined,
        tabSelect: () => undefined,
        tabClose: () => undefined,
        terminal: () => undefined,
        conversationApply: () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentPanelStore;
}

function workspace(tasks: readonly HappyAgentTask[] = []): HappyAgentWorkspaceStore {
    const snapshot = {
        list: {
            bots: [],
            tasks,
            taskDirectory: [],
            tasksArchived: [],
            projects: {
                type: "ready" as const,
                value: [
                    {
                        id: "prj_one",
                        path: "/Users/happy/happy",
                        displayPath: "~/happy",
                        name: "happy",
                        kind: "regular" as const,
                        lifecycle: { phase: "ready" as const },
                        worktrees: [],
                        activity: "idle" as const,
                        updatedAt: 1_763_999_000_000,
                        conversations: [
                            {
                                id: "ses_one",
                                title: "Fix token rotation race",
                                subtitle: "~/happy",
                                updatedAt: 1_763_999_000_000,
                                activity: "idle" as const,
                            },
                        ],
                    },
                ],
            },
        },
        conversation: { type: "unloaded" as const },
        /* The stub addresses nothing, and that is exactly the case the store
         * publishes the unlisted refusal for: an id the catalog does not
         * describe is never permission to write into it. Every snapshot carries
         * an access, so this one does too. */
        address: {},
        groupAccess: happyAgentGroupAccessRefused(HAPPY_AGENT_GROUP_UNLISTED_REFUSAL),
        fileTabs: [],
        tabOrder: [],
        openInTargets: [],
        fileViewMode: "unified" as const,
        fileScope: "changed" as const,
        fileLayout: "flat" as const,
        fileTreeExpanded: new Set<string>(),
        fileTreeCollapsed: new Set<string>(),
        fileSearch: { query: "", searching: false },
        workspaceFilesLoading: false,
        fileComments: { comments: [] },
        reviews: new Map(),
    };
    return {
        get: () => snapshot,
        deviceBridgeSupport: () => undefined,
        conversationsRetained: HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
        panel: panel(),
        subscribe: () => () => undefined,
        conversationOpen: () => undefined,
        conversationClose: () => undefined,
        conversationViewSizeUpdate: () => undefined,
        conversationListRetry: () => undefined,
        conversationRetry: () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentWorkspaceStore;
}

/* The catalog is only read by the settings window, so this projection needs
 * nothing more than a store that never resolves. */
function modelStore(): HappyAgentModelStore {
    return {
        get: () => MODELS_LOADING,
        subscribe: () => () => undefined,
        load: () => Promise.resolve(),
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentModelStore;
}

const MODELS_LOADING = { type: "loading" } as const;

/** One connected host Happy Agent holding the project above. */
function directory(
    host: HappyAgentHost,
    projects: AppHappyAgentDirectorySnapshot["happyAgents"][number]["projects"],
    tasks: readonly HappyAgentTask[] = [],
    happyAgentId = "local",
) {
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                bots: [],
                id: happyAgentId,
                label: "This Mac",
                projects,
                projectsStatus: "ready",
                session: {
                    clock: clock(),
                    connection: connection(),
                    host,
                    models: modelStore(),
                    workspace: workspace(tasks),
                },
                status: "connected",
            },
        ],
    };
    const store: AppHappyAgentDirectoryStore = {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
    return store;
}

function view(
    options: {
        chatId?: string;
        groupId?: string;
        host?: HappyAgentHost;
        happyAgentId?: string;
        platform?: "desktop" | "web";
        orkestChatReference?: boolean;
        orkestBoardUrl?: string;
        orkestInitialTaskHandoff?: OrkestTaskInitialHandoff;
        tasks?: readonly HappyAgentTask[];
        onOrkestTaskOpen?: (
            happyAgentId: string,
            location: { groupId: string; sessionId: string },
        ) => void;
        onChatSelect?: (happyAgentId: string, groupId: string | undefined, chatId?: string) => void;
    } = {},
) {
    const taskList = options.tasks ?? [];
    const projects = (
        workspace(taskList).get() as unknown as {
            list: {
                projects: {
                    value: AppHappyAgentDirectorySnapshot["happyAgents"][number]["projects"];
                };
            };
        }
    ).list.projects.value;
    const props = {
        appearance: appearanceStoreCreate({ mode: "light" }),
        chatId: options.chatId,
        groupId: options.groupId,
        platform: options.platform,
        orkestChatReference: options.orkestChatReference,
        orkestBoardUrl: options.orkestBoardUrl,
        orkestInitialTaskHandoff: options.orkestInitialTaskHandoff,
        onOrkestTaskOpen: options.onOrkestTaskOpen,
        onChatSelect: options.onChatSelect ?? (() => undefined),
        onFileClose: () => undefined,
        onFileSelect: () => undefined,
        onSettingsOpen: () => undefined,
        happyAgentId: options.happyAgentId ?? "local",
        happyAgents: directory(
            options.host ?? happyAgentHostNoop,
            projects,
            taskList,
            options.happyAgentId ?? "local",
        ),
    };
    return { ...render(<AppHappyAgentView {...props} />), props };
}

it("leaves the sidebar head to the window band, with no local-only title", () => {
    const { container } = view();

    // The integrated band holds the sidebar toggle and search in this lane, so
    // the product mark stands down and no local title takes its place.
    expect(container.querySelector('[data-happy-desktop-ui="sidebar-brand-logo"]')).toBeNull();
    expect(container.querySelector('[data-happy-desktop-ui="sidebar-title"]')).toBeNull();

    // The plain title row and its chevron affordance are gone.
    expect(container.textContent).not.toContain("Local");
    expect(container.querySelector(".happy-sidebar__title-chevron")).toBeNull();
});

it("links only the exact task for the routed conversation in the selected agent", () => {
    const task = {
        id: "task/7",
        workspaceId: "workspace-1",
        conversation: { id: "conversation-1" },
        subtasks: [],
    } as unknown as HappyAgentTask;
    const matching = view({
        groupId: "workspace-1",
        chatId: "conversation-1",
        platform: "web",
        orkestChatReference: true,
        orkestBoardUrl: "https://orkest.example/x/orkest/board?tenantId=tenant-1",
        tasks: [task],
    });
    const link = matching.container.querySelector('[data-testid="orkest-linked-work"]');
    expect(link?.textContent).toBe("Open linked work");
    expect(new URL(link?.getAttribute("href") ?? "").searchParams.get("taskId")).toBe("task/7");
    matching.unmount();

    const noMatch = view({
        groupId: "workspace-1",
        chatId: "other-conversation",
        platform: "web",
        orkestChatReference: true,
        orkestBoardUrl: "https://orkest.example/x/orkest/board?tenantId=tenant-1",
        tasks: [task],
    });
    expect(noMatch.container.querySelector('[data-testid="orkest-linked-work"]')).toBeNull();
    noMatch.unmount();

    const noTenant = view({
        groupId: "workspace-1",
        chatId: "conversation-1",
        platform: "web",
        orkestChatReference: true,
        orkestBoardUrl: "https://orkest.example/x/orkest/board",
        tasks: [task],
    });
    expect(noTenant.container.querySelector('[data-testid="orkest-linked-work"]')).toBeNull();
});

it("highlights the addressed project and asks to navigate into it when it is picked", () => {
    const selected: (string | undefined)[][] = [];
    const { container } = view({
        groupId: "prj_one",
        onChatSelect: (happyAgentId, groupId, chatId) =>
            selected.push([happyAgentId, groupId, chatId]),
    });

    const row = container.querySelector('[data-item-id="local/prj_one"]');
    expect(row?.getAttribute("aria-current")).toBe("page");

    // Picking a row is a navigation request into the project's most recent
    // session; this surface never selects a conversation in the store itself.
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(selected).toEqual([["local", "prj_one", "ses_one"]]);
});

it("lists one row per project and its sessions as tabs", () => {
    const { container } = view({ groupId: "prj_one" });

    // The sidebar list contains projects only; creating a session is an app-level
    // action rather than another project-shaped row.
    const rows = [...container.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')];
    // The Blueprint workbench row is offered only to a window that hands the
    // View somewhere to open it, and this one does not, so it is absent here
    // rather than depending on which mode the test runner happens to build in.
    expect(rows.map((row) => row.getAttribute("data-item-id"))).toEqual([
        "artifacts",
        "local/prj_one",
    ]);
    // The row is the project's name alone; its path would crowd the name out,
    // and the heading over the open project states it in full.
    expect(rows[1]?.textContent).toContain("happy");
    expect(rows[1]?.textContent).not.toContain("~/happy");

    // The sessions inside the addressed project are its tabs.
    const tabs = [...container.querySelectorAll('[data-happy-desktop-ui="tab"]')];
    expect(tabs.map((tab) => tab.getAttribute("data-tab-id"))).toEqual(["ses_one"]);
    expect(tabs[0]?.textContent).toContain("Fix token rotation race");
});

it("keeps an initial task pending until found and suppresses its stale banner after unmount", () => {
    const opened: [string, { groupId: string; sessionId: string }][] = [];
    const task: HappyAgentTask = {
        id: "attended-task-1" as HappyAgentTask["id"],
        workspaceId: "workspace-1" as HappyAgentTask["workspaceId"],
        name: "Attended task",
        conversation: {
            id: "conversation-1",
            title: "Attended task",
            activity: "idle",
            updatedAt: 0,
            participants: [],
        },
        subtasks: [],
        owner: null,
        path: "/work",
        displayPath: "/work",
        createdAt: 0,
        archived: false,
        canArchive: true,
    };
    let consumed = false;
    const initialTaskHandoff: OrkestTaskInitialHandoff = {
        taskId: task.id,
        get pendingTaskId() {
            return consumed ? undefined : task.id;
        },
        consume() {
            if (consumed) return false;
            consumed = true;
            return true;
        },
    };
    const options: Parameters<typeof view>[0] = {
        happyAgentId: "local",
        platform: "web",
        orkestChatReference: true,
        orkestInitialTaskHandoff: initialTaskHandoff,
        tasks: [task],
        onOrkestTaskOpen: (
            happyAgentId: string,
            location: { groupId: string; sessionId: string },
        ) => opened.push([happyAgentId, location]),
    };
    const waiting = view({ ...options, tasks: [] });
    expect(opened).toHaveLength(0);
    expect(initialTaskHandoff.pendingTaskId).toBe(task.id);
    expect(waiting.container.textContent).toContain(
        "That task is not in this Happy Agent’s task list.",
    );
    waiting.unmount();

    const rendered = view(options);

    expect(opened).toEqual([["local", { groupId: "workspace-1", sessionId: "conversation-1" }]]);

    rendered.unmount();
    const remounted = view({ ...options, happyAgentId: "other", tasks: [] });
    expect(opened).toHaveLength(1);
    expect(remounted.container.querySelector('[data-testid="orkest-task-handoff"]')).toBeNull();
});

/* Command-W follows the keyboard: a tab of the right pane while focus is in
 * the pane, the main content's tab everywhere else. */
it("routes Command-W to the focused pane", () => {
    const terminal = "tab_1" as HappyAgentPanelTabId;
    const pane = {
        open: true,
        filesViewOpen: true,
        activeViewId: terminal,
        tabs: [{ id: terminal, kind: "terminal", label: "Terminal 1", placement: "panel" }],
    } as unknown as HappyAgentPanelSnapshot;

    expect(workspaceCloseTargetFind("panel", pane, false)).toEqual({
        type: "view",
        viewId: terminal,
    });
    expect(workspaceCloseTargetFind("workspace", pane, false)).toEqual({ type: "main" });
    expect(workspaceCloseTargetFind("panel", { ...pane, activeViewId: "files" }, false)).toEqual({
        type: "view",
        viewId: "files",
    });
    expect(
        workspaceCloseTargetFind("panel", { ...pane, activeViewId: "artifacts" }, false),
    ).toEqual({ type: "pane" });
    // A closed pane, or one whose checkout is gone, leaves Command-W to the main content.
    expect(workspaceCloseTargetFind("panel", { ...pane, open: false }, false)).toEqual({
        type: "main",
    });
    expect(workspaceCloseTargetFind("panel", pane, true)).toEqual({ type: "main" });
});
