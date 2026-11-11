import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
    agentAuthor,
    productAgentName,
    productAgentNameSet,
    productBotDisplayName,
    statusBarStoreCreate,
} from "happy-desktop-state";
import {
    orkestBridgeEndpoint,
    orkestEmbedBrandApply,
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
