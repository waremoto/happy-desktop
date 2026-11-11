import type { TerminalConnection } from "happy-desktop-state";

/**
 * ORK-000016.5.1 — terminal sockets inside GhostShell.
 *
 * A WebSocket upgrade never runs GhostShell's identity middleware, so the
 * dashboard will not open a terminal socket on the strength of the session
 * cookie alone. Before each attach this connection POSTs the attach path to
 * `<prefix>__orkest_terminal_ticket` (an ordinary, fully gated request), and
 * opens the socket URL the dashboard answers with — a same-origin
 * `/proxy/orkest/chat-ws/…?ticket=…` that is good for one upgrade.
 *
 * Until that socket exists, writes are buffered and listeners are held, so
 * the terminal protocol above sees one ordinary connection.
 */

export interface OrkestTicketTerminalDeps {
    /** The ticket route's path on this origin. */
    readonly endpoint: string;
    readonly fetch: typeof fetch;
    /** Opens the real socket (BrowserTerminalConnection in the renderer). */
    readonly open: (url: string, protocols: readonly string[]) => TerminalConnection;
    /** This document's origin; the answered socket must stay on it. */
    readonly origin: string;
}

/** The ticket route under the prefix that served this document. */
export function orkestTerminalTicketEndpoint(baseURI: string): string {
    return new URL("__orkest_terminal_ticket", baseURI).pathname;
}

export class OrkestTicketTerminalConnection implements TerminalConnection {
    private inner: TerminalConnection | undefined;
    private readonly pending: Uint8Array[] = [];
    private readonly dataListeners: ((chunk: Uint8Array) => void)[] = [];
    private readonly errorListeners: ((error: Error) => void)[] = [];
    private readonly closeListeners: (() => void)[] = [];
    private paused = false;
    private closed = false;

    constructor(
        url: string,
        private readonly protocols: readonly string[],
        private readonly deps: OrkestTicketTerminalDeps,
    ) {
        void this.connect(new URL(url).pathname);
    }

    get destroyed(): boolean {
        return this.closed || (this.inner?.destroyed ?? false);
    }

    private async connect(path: string): Promise<void> {
        let socketUrl: string;
        try {
            const response = await this.deps.fetch(this.deps.endpoint, {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ path }),
            });
            if (!response.ok) throw new Error(`terminal ticket refused (${response.status})`);
            const answer = (await response.json()) as { url?: unknown };
            if (typeof answer.url !== "string") throw new Error("terminal ticket answer has no url");
            const target = new URL(answer.url, this.deps.origin);
            if (target.origin !== new URL(this.deps.origin).origin) {
                throw new Error("terminal ticket answered another origin");
            }
            target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
            socketUrl = target.toString();
        } catch (error) {
            this.fail(error instanceof Error ? error : new Error(String(error)));
            return;
        }
        if (this.closed) return;
        const inner = this.deps.open(socketUrl, this.protocols);
        this.inner = inner;
        for (const listener of this.dataListeners) inner.on("data", listener);
        for (const listener of this.errorListeners) inner.once("error", listener);
        for (const listener of this.closeListeners) inner.once("close", listener);
        if (this.paused) inner.pause();
        for (const chunk of this.pending.splice(0)) inner.write(chunk);
    }

    private fail(error: Error): void {
        if (this.closed) return;
        this.closed = true;
        for (const listener of this.errorListeners.splice(0)) listener(error);
        for (const listener of this.closeListeners.splice(0)) listener();
    }

    on(_event: "data", listener: (chunk: Uint8Array) => void): void {
        if (this.inner) this.inner.on("data", listener);
        else this.dataListeners.push(listener);
    }

    once(event: "error", listener: (error: Error) => void): void;
    once(event: "close", listener: () => void): void;
    once(event: "error" | "close", listener: ((error: Error) => void) | (() => void)): void {
        if (this.inner) {
            if (event === "error") this.inner.once("error", listener as (error: Error) => void);
            else this.inner.once("close", listener as () => void);
            return;
        }
        if (event === "error") this.errorListeners.push(listener as (error: Error) => void);
        else this.closeListeners.push(listener as () => void);
    }

    write(chunk: Uint8Array): void {
        if (this.closed) return;
        if (this.inner) this.inner.write(chunk);
        else this.pending.push(chunk);
    }

    pause(): void {
        this.paused = true;
        this.inner?.pause();
    }

    resume(): void {
        this.paused = false;
        this.inner?.resume();
    }

    destroy(error?: Error): void {
        if (this.inner) {
            this.inner.destroy(error);
            return;
        }
        if (this.closed) return;
        this.closed = true;
        this.pending.length = 0;
        for (const listener of this.closeListeners.splice(0)) listener();
    }
}
