import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
    type ConversationEntry,
    type HappyAgentModelCatalog,
    agentAuthor,
    productAgentName,
    productAgentNameSet,
    productBotDisplayName,
    statusBarStoreCreate,
} from "happy-desktop-state";
import {
    orkestBridgeEndpoint,
    orkestEmbedBrandApply,
    ORKEST_EMBED_COMPOSE_MAX,
    orkestEmbedChatFollow,
    orkestEmbedComposeCreate,
    orkestEmbedWorkItemCreate,
    orkestEmbedWorkItemFollow,
    orkestEmbedWorkItemPlace,
    orkestEmbedModelCreate,
    orkestEmbedScrollCreate,
    orkestEmbedModelFor,
    orkestEmbedScrollRow,
    orkestEmbedScrollRowKey,
    orkestEmbedScrollTarget,
    orkestEmbedStatusBarPersistence,
    orkestEmbedThemeCreate,
    orkestEmbedSidebarFollow,
    orkestEmbedWelcomePersistence,
} from "./orkestEmbed";

// ORK-000015: the renderer framed same-origin inside GhostShell's Orkest Chat tab.
describe("orkestBridgeEndpoint", () => {
    it("keeps the root endpoint outside the embed", () => {
        expect(orkestBridgeEndpoint("http://127.0.0.1:5320/", false)).toBe("/__happy_local_happy_agent");
    });

    it("resolves under the dashboard prefix that served the document", () => {
        expect(
            orkestBridgeEndpoint("https://ghost.ware.cl/proxy/orkest/chat/maremoto/?taskId=a&theme=dark", true),
        ).toBe("/proxy/orkest/chat/maremoto/__happy_local_happy_agent");
    });
});

function fakeWindow(search: string) {
    const listeners: ((event: MessageEvent) => void)[] = [];
    const parent = {};
    return {
        parent,
        location: { origin: "https://ghost.ware.cl", search },
        addEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.push(listener),
        removeEventListener: vi.fn(),
        dispatch(data: unknown, origin = "https://ghost.ware.cl", source: unknown = parent) {
            for (const listener of listeners) listener({ data, origin, source } as MessageEvent);
        },
    };
}

describe("orkestEmbedThemeCreate", () => {
    it("starts from ?theme and falls back otherwise", () => {
        expect(orkestEmbedThemeCreate(fakeWindow("?theme=dark") as never, () => "light").get()).toBe("dark");
        expect(orkestEmbedThemeCreate(fakeWindow("?theme=x") as never, () => "light").get()).toBe("light");
    });

    it("follows GhostShell's same-origin messages from the parent only", () => {
        const win = fakeWindow("?theme=light");
        const theme = orkestEmbedThemeCreate(win as never, () => "light");
        const listener = vi.fn();
        theme.subscribe(listener);
        win.dispatch({ type: "orkest-chat:theme", theme: "dark" }, "https://evil.example");
        win.dispatch({ type: "orkest-chat:theme", theme: "dark" }, "https://ghost.ware.cl", {});
        win.dispatch({ type: "orkest-chat:theme", theme: "purple" });
        expect(theme.get()).toBe("light");
        expect(listener).not.toHaveBeenCalled();
        win.dispatch({ type: "orkest-chat:theme", theme: "dark" });
        expect(theme.get()).toBe("dark");
        expect(listener).toHaveBeenCalledOnce();
    });
});

// Inside GhostShell the person already chose Orkest: Happy's first-run welcome deck never shows.
describe("orkestEmbedWelcomePersistence", () => {
    it("reads as already welcomed and writes nothing", () => {
        const persistence = orkestEmbedWelcomePersistence();
        expect(persistence.read()).toEqual({ welcomeAcknowledged: true });
        expect(() => persistence.write({ welcomeAcknowledged: false })).not.toThrow();
        expect(persistence.read()).toEqual({ welcomeAcknowledged: true });
    });
});

describe("orkestEmbedSidebarFollow", () => {
    function resizable(width: number) {
        const listeners: (() => void)[] = [];
        return {
            innerWidth: width,
            addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
            resize(next: number) {
                this.innerWidth = next;
                for (const listener of listeners) listener();
            },
        };
    }

    it("folds the sidebar in a phone-width frame and keeps it on a wide one", () => {
        const narrow = { sidebarHiddenUpdate: vi.fn() };
        orkestEmbedSidebarFollow(narrow, resizable(390) as never);
        expect(narrow.sidebarHiddenUpdate).toHaveBeenCalledWith(true);
        const wide = { sidebarHiddenUpdate: vi.fn() };
        orkestEmbedSidebarFollow(wide, resizable(1200) as never);
        expect(wide.sidebarHiddenUpdate).not.toHaveBeenCalled();
    });

    it("changes only when the frame crosses the breakpoint", () => {
        const store = { sidebarHiddenUpdate: vi.fn() };
        const win = resizable(1200);
        orkestEmbedSidebarFollow(store, win as never);
        win.resize(1000);
        expect(store.sidebarHiddenUpdate).not.toHaveBeenCalled();
        win.resize(390);
        expect(store.sidebarHiddenUpdate).toHaveBeenLastCalledWith(true);
        win.resize(1200);
        expect(store.sidebarHiddenUpdate).toHaveBeenLastCalledWith(false);
        expect(store.sidebarHiddenUpdate).toHaveBeenCalledTimes(2);
    });
});

// ORK-000016.4.1: inside GhostShell the agent is Orkest and GhostShell owns the theme.
describe("orkestEmbedBrandApply", () => {
    it("names the agent Orkest in copy, and shows the daemon's built-in bot under that name", () => {
        expect(productAgentName()).toBe("Happy");
        try {
            orkestEmbedBrandApply();
            expect(productAgentName()).toBe("Orkest");
            expect(agentAuthor.displayName).toBe("Orkest");
            expect(productBotDisplayName("Happy", "chief_of_staff")).toBe("Orkest");
            // Other bots, and a built-in bot its owner renamed, keep their names.
            expect(productBotDisplayName("Happy")).toBe("Happy");
            expect(productBotDisplayName("Ops", "chief_of_staff")).toBe("Ops");
        } finally {
            productAgentNameSet("");
        }
        expect(agentAuthor.displayName).toBe("Happy");
    });
});

describe("orkestEmbedStatusBarPersistence", () => {
    it("hides the theme menu and never writes the desktop's record", () => {
        const persistence = orkestEmbedStatusBarPersistence();
        const write = vi.spyOn(persistence, "write");
        const store = statusBarStoreCreate(persistence);
        expect(store.get().themeShown).toBe(false);
        expect(store.get().keepAwakeShown).toBe(false);
        store.keepAwakeShownUpdate(true);
        expect(write).toHaveBeenCalled();
        expect(persistence.read()).toEqual({ themeShown: false, keepAwakeShown: false });
    });

    it("is what the renderer uses, with the brand, only when embedded", () => {
        const renderer = readFileSync(new URL("./renderer.tsx", import.meta.url), "utf8");
        expect(renderer).toMatch(/orkestEmbed \? orkestEmbedStatusBarPersistence\(\) : desktopStatusBarPersistence\(\)/);
        expect(renderer).toMatch(/if \(orkestEmbed\) orkestEmbedBrandApply\(\)/);
        const app = readFileSync(new URL("../../../happy-desktop-app/sources/AppHappyAgentView.tsx", import.meta.url), "utf8");
        expect(app).not.toMatch(/"Message Happy/);
        expect(app).toMatch(/const agent = productAgentName\(\);/);
    });
});

// GHO-205.5.3: "Show previous" on a doc change scrolls the framed chat to the turn that made it.
describe("orkestEmbedScrollCreate", () => {
    it("hears a well-formed turn from the same-origin parent only, and keeps it until taken", async () => {
        const { orkestEmbedScrollCreate } = await import("./orkestEmbed");
        const win = fakeWindow("");
        const scroll = orkestEmbedScrollCreate(win as never);
        const listener = vi.fn();
        scroll.subscribe(listener);
        win.dispatch({ type: "orkest-chat:scroll-to", turn: "turn-7" }, "https://evil.example");
        win.dispatch({ type: "orkest-chat:scroll-to", turn: "turn-7" }, "https://ghost.ware.cl", {});
        win.dispatch({ type: "orkest-chat:scroll-to", turn: "has space" });
        win.dispatch({ type: "orkest-chat:scroll-to", turn: 7 });
        expect(listener).not.toHaveBeenCalled();
        expect(scroll.take()).toBeUndefined();
        win.dispatch({ type: "orkest-chat:scroll-to", turn: "turn-7" });
        expect(listener).toHaveBeenCalledWith("turn-7");
        expect(scroll.take()).toBe("turn-7");
        expect(scroll.take()).toBeUndefined();
    });
});

// GHO-205.7.2: the turn GhostShell sends is the transcript's `propose_document` tool call id.
const TURN = "k3v9q2m7x1c8d4f6h0j5";

function userRow(id: string): ConversationEntry {
    return {
        kind: "message",
        message: { id, sender: { kind: "user" } },
        source: "server",
        delivery: "sent",
    } as unknown as ConversationEntry;
}

function agentRow(id: string, runId: string, extra: Record<string, unknown> = {}): ConversationEntry {
    return {
        kind: "message",
        message: { id, sender: { kind: "agent" } },
        source: "server",
        delivery: "sent",
        runId,
        ...extra,
    } as unknown as ConversationEntry;
}

function toolRow(id: string, toolCallId: string): ConversationEntry {
    return {
        kind: "agentActivity",
        id,
        sequence: id,
        activity: { kind: "tool", tool: { toolCallId, toolName: "propose_document" } },
    } as unknown as ConversationEntry;
}

function statusRow(id: string, runId: string): ConversationEntry {
    return { kind: "turnStatus", id, runId, sequence: id, status: "complete" } as unknown as ConversationEntry;
}

describe("orkestEmbedScrollRowKey", () => {
    it("lands on a row keyed by the turn itself", () => {
        const rows = [userRow("u1"), agentRow(TURN, "run-1"), statusRow("run-1:status", "run-1")];
        expect(orkestEmbedScrollRowKey(TURN, rows)).toBe(TURN);
    });

    it("lands on the row showing the tool call whose id is the turn", () => {
        const rows = [
            userRow("u1"),
            toolRow("message:m1:0", "other-call"),
            toolRow("message:m1:1", TURN),
            agentRow("message:m1:2", "run-1"),
        ];
        expect(orkestEmbedScrollRowKey(TURN, rows)).toBe("message:m1:1");
    });

    it("lands on the visible row a folded turn rides on when the call's row is folded away", () => {
        const rows = [
            userRow("u0"),
            agentRow("message:m0:0", "run-0", { traceFoldAnchorId: "run-0" }),
            userRow("u1"),
            agentRow("message:m1:2", "run-1"),
            agentRow("message:m1:3", "run-1", { traceFoldAnchorId: "run-1" }),
            statusRow("run-1:status", "run-1"),
        ];
        const calls = [
            { toolCallId: "earlier", runId: "run-0" },
            { toolCallId: TURN, runId: "run-1" },
        ];
        expect(orkestEmbedScrollRowKey(TURN, rows, calls)).toBe("message:m1:3");
    });

    it("falls back to the first row of the call's run", () => {
        const rows = [
            userRow("u0"),
            agentRow("message:m0:0", "run-0"),
            userRow("u1"),
            agentRow("message:m1:3", "run-1"),
            statusRow("run-1:status", "run-1"),
        ];
        expect(orkestEmbedScrollRowKey(TURN, rows, [{ toolCallId: TURN, runId: "run-1" }])).toBe("message:m1:3");
    });

    it("finds nothing for a turn this conversation does not hold", () => {
        const rows = [userRow("u1"), agentRow("message:m1:0", "run-1"), toolRow("message:m1:1", "other-call")];
        expect(orkestEmbedScrollRowKey(TURN, rows)).toBeUndefined();
        expect(orkestEmbedScrollRowKey(TURN, rows, [{ toolCallId: TURN, runId: "run-9" }])).toBeUndefined();
        expect(orkestEmbedScrollRowKey(TURN, [])).toBeUndefined();
    });
});

describe("orkestEmbedScrollRow", () => {
    it("names the row and puts its top at the viewport's top", () => {
        const row = orkestEmbedScrollRow("message:m1:1");
        expect(row).toMatchObject({ type: "row", rowKey: "message:m1:1", offset: 0 });
        // MessageList clamps the opening inset to the viewport height: an inset at least that tall is the top.
        expect(row.viewportInset).toBeDefined();
        expect(Number.isFinite(row.viewportInset)).toBe(true);
        expect(row.viewportInset!).toBeGreaterThanOrEqual(100_000);
    });
});

describe("orkestEmbedScrollTarget", () => {
    it("is the top-of-viewport position of the resolved row", () => {
        const rows = [userRow("u1"), toolRow("message:m1:1", TURN)];
        expect(orkestEmbedScrollTarget(TURN, rows)).toEqual(orkestEmbedScrollRow("message:m1:1"));
    });

    it("is nothing when no row holds the turn, so the chat stays as it is", () => {
        expect(orkestEmbedScrollTarget(TURN, [userRow("u1")])).toBeUndefined();
    });
});

describe("orkestEmbedModelCreate", () => {
    it("hears a known lane from the same-origin parent only", () => {
        const win = fakeWindow("");
        const model = orkestEmbedModelCreate(win as never);
        const listener = vi.fn();
        model.subscribe(listener);
        win.dispatch({ type: "orkest-chat:model", lane: "opus" }, "https://evil.example");
        win.dispatch({ type: "orkest-chat:model", lane: "opus" }, "https://ghost.ware.cl", {});
        win.dispatch({ type: "orkest-chat:model", lane: "gpt" });
        win.dispatch({ type: "orkest-chat:model", lane: 3 });
        win.dispatch({ type: "orkest-chat:model" });
        win.dispatch({ type: "orkest-chat:theme", lane: "opus" });
        win.dispatch(null);
        expect(listener).not.toHaveBeenCalled();
        win.dispatch({ type: "orkest-chat:model", lane: "haiku" });
        win.dispatch({ type: "orkest-chat:model", lane: "sonnet" });
        win.dispatch({ type: "orkest-chat:model", lane: "opus" });
        expect(listener.mock.calls).toEqual([["haiku"], ["sonnet"], ["opus"]]);
    });

    it("stops telling a listener that unsubscribed", () => {
        const win = fakeWindow("");
        const model = orkestEmbedModelCreate(win as never);
        const listener = vi.fn();
        const stop = model.subscribe(listener);
        win.dispatch({ type: "orkest-chat:model", lane: "opus" });
        stop();
        win.dispatch({ type: "orkest-chat:model", lane: "haiku" });
        expect(listener.mock.calls).toEqual([["opus"]]);
    });
});

describe("orkestEmbedModelFor", () => {
    const models = (...ids: string[]) => ids.map((id) => ({ id }));
    const catalog = {
        providers: [
            { id: "codex-main", type: "codex", models: models("openai/opus-lookalike", "openai/gpt-5") },
            {
                id: "claude-main",
                type: "claude",
                models: models(
                    "anthropic/opus-5-5",
                    "anthropic/sonnet-5-5",
                    "anthropic/haiku-5-5",
                    "anthropic/opus-4-7",
                    "anthropic/sonnet-4-6",
                    "anthropic/haiku-4-5",
                ),
            },
            { id: "claude-sonnet-only", type: "claude", models: models("anthropic/sonnet-5-5") },
        ],
    } as unknown as Pick<HappyAgentModelCatalog, "providers">;

    it("picks the provider's newest model for each lane", () => {
        expect(orkestEmbedModelFor("opus", catalog, "claude-main")).toEqual({
            providerId: "claude-main",
            modelId: "anthropic/opus-5-5",
        });
        expect(orkestEmbedModelFor("sonnet", catalog, "claude-main")).toEqual({
            providerId: "claude-main",
            modelId: "anthropic/sonnet-5-5",
        });
        expect(orkestEmbedModelFor("haiku", catalog, "claude-main")).toEqual({
            providerId: "claude-main",
            modelId: "anthropic/haiku-5-5",
        });
    });

    it("looks only at the named provider", () => {
        expect(orkestEmbedModelFor("opus", catalog, "codex-main")).toEqual({
            providerId: "codex-main",
            modelId: "openai/opus-lookalike",
        });
        expect(orkestEmbedModelFor("sonnet", catalog, "claude-sonnet-only")).toEqual({
            providerId: "claude-sonnet-only",
            modelId: "anthropic/sonnet-5-5",
        });
    });

    it("resolves nothing for a lane or provider the catalog does not have", () => {
        expect(orkestEmbedModelFor("opus", catalog, "claude-sonnet-only")).toBeUndefined();
        expect(orkestEmbedModelFor("haiku", catalog, "missing")).toBeUndefined();
        expect(orkestEmbedModelFor("opus", { providers: [] }, "claude-main")).toBeUndefined();
    });
});

// GHO-205.7.2: the renderer's wiring, over a workspace that opens one conversation.
describe("orkestEmbedChatFollow", () => {
    function workspaceFake() {
        const listeners = new Set<() => void>();
        let conversation: unknown = { type: "loading" };
        const workspace = {
            get: () => ({ conversation }),
            subscribe(listener: () => void) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            conversationScrollJump: vi.fn(),
            conversationToolCallRuns: vi.fn(() => [{ toolCallId: TURN, runId: "run-1" }]),
            sessionModelUpdate: vi.fn(),
            draftAppend: vi.fn(async () => undefined),
        };
        return {
            workspace,
            open(value: Record<string, unknown>) {
                conversation = { type: "ready", value: { ready: true, ...value } };
                for (const listener of listeners) listener();
            },
        };
    }
    const menus = {
        currentProviderId: "claude-main",
        currentModelId: "anthropic/sonnet-5-5",
        modelOptions: [
            { providerId: "codex-main", modelId: "openai/opus-lookalike", disabled: false },
            { providerId: "claude-main", modelId: "anthropic/opus-5-5", disabled: false },
            { providerId: "claude-main", modelId: "anthropic/sonnet-5-5", disabled: false },
            { providerId: "claude-main", modelId: "anthropic/opus-4-7", disabled: false },
        ],
    };
    function follow() {
        const win = fakeWindow("");
        const fake = workspaceFake();
        const stop = orkestEmbedChatFollow({
            scroll: orkestEmbedScrollCreate(win as never),
            model: orkestEmbedModelCreate(win as never),
            compose: orkestEmbedComposeCreate(win as never),
            workspace: { get: () => fake.workspace as never, subscribe: () => () => undefined },
        });
        return { win, ...fake, stop };
    }
    const rows = [userRow("u1"), agentRow("message:m1:3", "run-1", { traceFoldAnchorId: "run-1" })];

    it("lands the open conversation on the turn's row now", () => {
        const chat = follow();
        chat.open({ conversationId: "s1", entries: rows });
        chat.win.dispatch({ type: "orkest-chat:scroll-to", turn: TURN });
        expect(chat.workspace.conversationScrollJump).toHaveBeenCalledWith("s1", orkestEmbedScrollRow("message:m1:3"));
        chat.stop();
    });

    it("keeps a turn that came first for the conversation that opens, once", () => {
        const chat = follow();
        chat.win.dispatch({ type: "orkest-chat:scroll-to", turn: TURN });
        expect(chat.workspace.conversationScrollJump).not.toHaveBeenCalled();
        chat.open({ conversationId: "s1", standIn: true, entries: rows });
        expect(chat.workspace.conversationScrollJump).not.toHaveBeenCalled();
        chat.open({ conversationId: "s1", entries: rows });
        chat.open({ conversationId: "s1", entries: rows });
        expect(chat.workspace.conversationScrollJump).toHaveBeenCalledOnce();
        chat.stop();
    });

    it("leaves the chat as it is for a turn with no row", () => {
        const chat = follow();
        chat.open({ conversationId: "s1", entries: [userRow("u1")] });
        chat.win.dispatch({ type: "orkest-chat:scroll-to", turn: "unknown-turn" });
        expect(chat.workspace.conversationScrollJump).not.toHaveBeenCalled();
        chat.stop();
    });

    it("adds GhostShell's suggestion to the open conversation's draft", () => {
        const chat = follow();
        chat.open({ conversationId: "s1", entries: [] });
        chat.win.dispatch({ type: "orkest-chat:compose", text: "  Draft a roadmap  " });
        expect(chat.workspace.draftAppend).toHaveBeenCalledWith("s1", "Draft a roadmap");
        chat.stop();
    });

    it("keeps a suggestion that came first for the conversation that opens, once", () => {
        const chat = follow();
        chat.win.dispatch({ type: "orkest-chat:compose", text: "Draft a roadmap" });
        expect(chat.workspace.draftAppend).not.toHaveBeenCalled();
        chat.open({ conversationId: "s1", standIn: true, entries: [] });
        expect(chat.workspace.draftAppend).not.toHaveBeenCalled();
        chat.open({ conversationId: "s1", entries: [] });
        chat.open({ conversationId: "s1", entries: [] });
        expect(chat.workspace.draftAppend).toHaveBeenCalledOnce();
        chat.stop();
    });

    it("switches the open conversation to its provider's newest model for the lane, and only when it changes", () => {
        const chat = follow();
        chat.win.dispatch({ type: "orkest-chat:model", lane: "opus" });
        expect(chat.workspace.sessionModelUpdate).not.toHaveBeenCalled();
        chat.open({ conversationId: "s1", entries: [], menus });
        chat.win.dispatch({ type: "orkest-chat:model", lane: "sonnet" });
        chat.win.dispatch({ type: "orkest-chat:model", lane: "haiku" });
        expect(chat.workspace.sessionModelUpdate).not.toHaveBeenCalled();
        chat.win.dispatch({ type: "orkest-chat:model", lane: "opus" });
        expect(chat.workspace.sessionModelUpdate).toHaveBeenCalledWith({
            providerId: "claude-main",
            modelId: "anthropic/opus-5-5",
        });
        chat.stop();
    });
});

describe("orkestEmbedComposeCreate", () => {
    it("hears only non-blank text of bounded length from the framing page", () => {
        const win = fakeWindow("");
        const compose = orkestEmbedComposeCreate(win as never);
        const listener = vi.fn();
        compose.subscribe(listener);
        win.dispatch({ type: "orkest-chat:compose", text: "hi" }, "https://evil.example");
        win.dispatch({ type: "orkest-chat:compose", text: "hi" }, "https://ghost.ware.cl", {});
        win.dispatch({ type: "orkest-chat:compose", text: "   " });
        win.dispatch({ type: "orkest-chat:compose", text: 3 });
        win.dispatch({ type: "orkest-chat:compose", text: "x".repeat(ORKEST_EMBED_COMPOSE_MAX + 1) });
        expect(listener).not.toHaveBeenCalled();
        expect(compose.take()).toBeUndefined();
        win.dispatch({ type: "orkest-chat:compose", text: "Draft a roadmap" });
        expect(listener).toHaveBeenCalledWith("Draft a roadmap");
        expect(compose.take()).toBe("Draft a roadmap");
        expect(compose.take()).toBeUndefined();
    });
});

function chipDocument(withComposer = true) {
    const children: unknown[] = [];
    const parent = {
        insertBefore(node: unknown, before: unknown) {
            const at = children.indexOf(node);
            if (at >= 0) children.splice(at, 1);
            children.splice(children.indexOf(before), 0, node);
            return node;
        },
    };
    const composer = { parentElement: parent };
    if (withComposer) children.push(composer);
    let chip: Record<string, unknown> | null = null;
    const doc = {
        querySelector: (selector: string) =>
            withComposer && selector === '[data-happy-desktop-ui="composer"]' ? composer : null,
        getElementById: (id: string) => (chip && chip.id === id && children.includes(chip) ? chip : null),
        createElement: () => {
            const attributes: Record<string, string> = {};
            const made: Record<string, unknown> = {
                id: "",
                textContent: null,
                title: "",
                style: { cssText: "" },
                attributes,
                setAttribute: (name: string, value: string) => {
                    attributes[name] = value;
                },
                get nextElementSibling() {
                    const at = children.indexOf(made);
                    return at < 0 ? null : children[at + 1];
                },
                parentElement: parent,
                remove: () => {
                    children.splice(children.indexOf(made), 1);
                },
            };
            chip = made;
            return made;
        },
    };
    return { doc, children, composer, chip: () => chip };
}

describe("orkestEmbedWorkItemCreate", () => {
    it("keeps the last well-formed work item, and null clears it", () => {
        const win = fakeWindow("");
        const source = orkestEmbedWorkItemCreate(win as never);
        const listener = vi.fn();
        source.subscribe(listener);
        win.dispatch({ type: "orkest-chat:work-item", item: { label: "GHO-1", title: "t" } }, "https://evil.example");
        win.dispatch({ type: "orkest-chat:work-item", item: { label: "", title: "t" } });
        win.dispatch({ type: "orkest-chat:work-item", item: { label: "GHO-1" } });
        win.dispatch({ type: "orkest-chat:work-item", item: "GHO-1" });
        expect(listener).not.toHaveBeenCalled();
        win.dispatch({ type: "orkest-chat:work-item", item: { label: " GHO-1 ", title: " Fix it " } });
        expect(source.get()).toEqual({ label: "GHO-1", title: "Fix it" });
        win.dispatch({ type: "orkest-chat:work-item", item: null });
        expect(source.get()).toBeNull();
        expect(listener).toHaveBeenCalledTimes(2);
    });
});

describe("orkestEmbedWorkItemPlace", () => {
    it("puts one chip right above the composer and removes it for null", () => {
        const page = chipDocument();
        orkestEmbedWorkItemPlace(page.doc as never, { label: "GHO-1", title: "Fix it" });
        orkestEmbedWorkItemPlace(page.doc as never, { label: "GHO-1", title: "Fix it" });
        expect(page.children).toEqual([page.chip(), page.composer]);
        expect(page.chip()?.textContent).toBe("GHO-1 · Fix it");
        expect((page.chip()?.attributes as Record<string, string>)["data-orkest-work-item"]).toBe("");
        orkestEmbedWorkItemPlace(page.doc as never, null);
        expect(page.children).toEqual([page.composer]);
    });

    it("shows nothing before the composer exists", () => {
        const page = chipDocument(false);
        orkestEmbedWorkItemPlace(page.doc as never, { label: "GHO-1", title: "" });
        expect(page.chip()).toBeNull();
    });

    it("follows the work item and places the chip again when the document changes", () => {
        const page = chipDocument();
        const win = fakeWindow("");
        let changed: () => void = () => undefined;
        const stop = orkestEmbedWorkItemFollow({
            doc: page.doc as never,
            source: orkestEmbedWorkItemCreate(win as never),
            observe: (callback) => {
                changed = callback;
                return () => undefined;
            },
        });
        expect(page.chip()).toBeNull();
        win.dispatch({ type: "orkest-chat:work-item", item: { label: "GHO-2", title: "" } });
        expect(page.children).toEqual([page.chip(), page.composer]);
        page.children.reverse();
        changed();
        expect(page.children).toEqual([page.chip(), page.composer]);
        expect(page.chip()?.textContent).toBe("GHO-2");
        stop();
    });
});
