import { describe, expect, it, vi } from "vitest";
import type { TerminalConnection } from "happy-desktop-state";
import {
    OrkestTicketTerminalConnection,
    orkestTerminalTicketEndpoint,
} from "./orkestTerminal";
import { orkestTerminalExpectedHost } from "../main/browserDevServer";

// ORK-000016.5.1: inside GhostShell a terminal socket first asks the dashboard
// for a one-time ticket over the gated HTTP path, then opens the socket URL the
// dashboard answers with.

class FakeConnection implements TerminalConnection {
    readonly writes: Uint8Array[] = [];
    private data = new Set<(chunk: Uint8Array) => void>();
    private closes = new Set<() => void>();
    private errors = new Set<(error: Error) => void>();
    paused = false;
    destroyed = false;
    constructor(
        readonly url: string,
        readonly protocols: readonly string[],
    ) {}
    on(_event: "data", listener: (chunk: Uint8Array) => void): void {
        this.data.add(listener);
    }
    once(event: "error" | "close", listener: ((error: Error) => void) & (() => void)): void {
        if (event === "error") this.errors.add(listener);
        else this.closes.add(listener);
    }
    write(chunk: Uint8Array): void {
        this.writes.push(chunk);
    }
    pause(): void {
        this.paused = true;
    }
    resume(): void {
        this.paused = false;
    }
    destroy(): void {
        this.destroyed = true;
        for (const listener of this.closes) listener();
    }
    emit(chunk: Uint8Array): void {
        for (const listener of this.data) listener(chunk);
    }
}

const ATTACH = "/proxy/orkest/chat/maremoto/__happy_local_happy_agent/v0/workspaces/w/terminals/t/attach";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(answer: () => Promise<Response>) {
    const opened: FakeConnection[] = [];
    const fetchImpl = vi.fn(async () => answer());
    const connection = new OrkestTicketTerminalConnection(
        `wss://ghost.ware.cl${ATTACH}`,
        ["happy2-terminal.v1"],
        {
            endpoint: "/proxy/orkest/chat/maremoto/__orkest_terminal_ticket",
            fetch: fetchImpl as unknown as typeof fetch,
            open: (url, protocols) => {
                const fake = new FakeConnection(url, protocols);
                opened.push(fake);
                return fake;
            },
            origin: "https://ghost.ware.cl",
        },
    );
    return { connection, opened, fetchImpl };
}

describe("orkestTerminalTicketEndpoint", () => {
    it("sits under the prefix that served the document", () => {
        expect(
            orkestTerminalTicketEndpoint("https://ghost.ware.cl/proxy/orkest/chat/maremoto/?taskId=a"),
        ).toBe("/proxy/orkest/chat/maremoto/__orkest_terminal_ticket");
    });
});

describe("OrkestTicketTerminalConnection", () => {
    it("asks for a ticket with the attach path, then opens the answered socket", async () => {
        const { connection, opened, fetchImpl } = setup(async () =>
            Response.json({ url: "/proxy/orkest/chat-ws/maremoto/x/attach?ticket=abc" }),
        );
        const first = new Uint8Array([1]);
        connection.write(first);
        await tick();
        expect(fetchImpl).toHaveBeenCalledWith(
            "/proxy/orkest/chat/maremoto/__orkest_terminal_ticket",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ path: ATTACH }) }),
        );
        expect(opened).toHaveLength(1);
        expect(opened[0]!.url).toBe("wss://ghost.ware.cl/proxy/orkest/chat-ws/maremoto/x/attach?ticket=abc");
        expect(opened[0]!.protocols).toEqual(["happy2-terminal.v1"]);
        // Frames written before the socket existed reach it in order.
        expect(opened[0]!.writes).toEqual([first]);
        const received: Uint8Array[] = [];
        connection.on("data", (chunk) => received.push(chunk));
        opened[0]!.emit(new Uint8Array([2]));
        expect(received).toEqual([new Uint8Array([2])]);
    });

    it("reports a refused ticket as a failed terminal and closes", async () => {
        const { connection, opened } = setup(async () => new Response("no", { status: 403 }));
        const error = vi.fn();
        const close = vi.fn();
        connection.once("error", error);
        connection.once("close", close);
        await tick();
        expect(opened).toHaveLength(0);
        expect(error).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalledOnce();
        expect(connection.destroyed).toBe(true);
    });

    it("never opens a socket once destroyed while the ticket was pending", async () => {
        const { connection, opened } = setup(async () =>
            Response.json({ url: "/proxy/orkest/chat-ws/maremoto/x/attach?ticket=abc" }),
        );
        connection.destroy();
        await tick();
        expect(opened).toHaveLength(0);
    });

    it("refuses a socket URL off this origin", async () => {
        const { connection, opened } = setup(async () => Response.json({ url: "wss://evil.example/x" }));
        const error = vi.fn();
        connection.once("error", error);
        await tick();
        expect(opened).toHaveLength(0);
        expect(error).toHaveBeenCalledOnce();
    });
});

describe("orkestTerminalExpectedHost", () => {
    it("keeps the Host check unkeyed and drops it when the chat key guards the bridge", () => {
        expect(orkestTerminalExpectedHost(undefined, "127.0.0.1:5320")).toBe("127.0.0.1:5320");
        expect(orkestTerminalExpectedHost("", "127.0.0.1:5320")).toBe("127.0.0.1:5320");
        expect(orkestTerminalExpectedHost("key", "127.0.0.1:5320")).toBeUndefined();
    });
});
