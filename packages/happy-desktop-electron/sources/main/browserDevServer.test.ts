import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { browserLocalHappyAgentPlugin } from "./browserDevServer";
import type { LocalHappyAgentConnection } from "./localHappyAgent";
import { HappyAgentDaemonHttpError, type HappyAgentDaemonClient } from "./happyAgentDaemonClient";

const endpoint = "/__happy_local_happy_agent";

type Middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
) => void | Promise<void>;

interface Captured {
    status?: number;
    body: string;
    response: ServerResponse;
}

function fakeResponse(): Captured {
    const captured: Captured = { body: "", response: undefined as unknown as ServerResponse };
    let headersSent = false;
    const response = {
        get headersSent() {
            return headersSent;
        },
        writeHead(status: number) {
            captured.status = status;
            headersSent = true;
            return response;
        },
        write() {
            return true;
        },
        end(chunk?: string) {
            if (chunk) captured.body = chunk;
            return response;
        },
    } as unknown as ServerResponse;
    captured.response = response;
    return captured;
}

function healthReady(version: string) {
    return {
        status: "ready" as const,
        healthy: true,
        ready: true,
        version: { daemon: version, protocol: 17 },
    };
}

/** One daemon connection whose health answers from a scripted queue. */
function connectionWith(
    health: () => Promise<unknown>,
    close = vi.fn(),
): LocalHappyAgentConnection {
    return {
        client: { health } as unknown as HappyAgentDaemonClient,
        version: "0.0.55",
        close,
    };
}

function middlewareOf(plugin: ReturnType<typeof browserLocalHappyAgentPlugin>): Middleware {
    let middleware: Middleware | undefined;
    const server = {
        config: { server: { host: "127.0.0.1", port: 5174 } },
        middlewares: {
            use: (handler: Middleware) => {
                middleware = handler;
            },
        },
        httpServer: undefined,
    };
    const configure = plugin.configureServer;
    if (typeof configure !== "function") throw new Error("The plugin registered no dev server.");
    (configure as (value: unknown) => void).call(plugin, server);
    if (!middleware) throw new Error("The plugin registered no middleware.");
    return middleware;
}

async function health(middleware: Middleware): Promise<Captured> {
    const request = new EventEmitter() as unknown as IncomingMessage;
    Object.assign(request, { method: "GET", url: `${endpoint}/health` });
    const captured = fakeResponse();
    await middleware(request, captured.response, () => undefined);
    return captured;
}

describe("browserLocalHappyAgentPlugin", () => {
    it("reconnects with a fresh token after the daemon restarts", async () => {
        const staleClose = vi.fn();
        const connect = vi
            .fn<() => Promise<LocalHappyAgentConnection>>()
            .mockResolvedValueOnce(
                connectionWith(
                    () => Promise.reject(new HappyAgentDaemonHttpError(401, "invalid token")),
                    staleClose,
                ),
            )
            .mockResolvedValueOnce(connectionWith(() => Promise.resolve(healthReady("0.0.55"))));
        const middleware = middlewareOf(browserLocalHappyAgentPlugin({ connect }));

        const failed = await health(middleware);
        expect(failed.status).toBe(401);

        const recovered = await health(middleware);
        expect(recovered.status).toBe(200);
        expect(JSON.parse(recovered.body)).toMatchObject({ status: "ready", version: "0.0.55" });
        expect(connect).toHaveBeenCalledTimes(2);
        expect(staleClose).toHaveBeenCalledOnce();
    });

    it("keeps one connection while the daemon answers", async () => {
        const connect = vi
            .fn<() => Promise<LocalHappyAgentConnection>>()
            .mockResolvedValue(connectionWith(() => Promise.resolve(healthReady("0.0.55"))));
        const middleware = middlewareOf(browserLocalHappyAgentPlugin({ connect }));

        expect((await health(middleware)).status).toBe(200);
        expect((await health(middleware)).status).toBe(200);
        expect(connect).toHaveBeenCalledOnce();
    });

    it("retries a connect that failed while the daemon was down", async () => {
        const connect = vi
            .fn<() => Promise<LocalHappyAgentConnection>>()
            .mockRejectedValueOnce(
                new Error("Timed out while waiting for the normal Happy Agent daemon."),
            )
            .mockResolvedValueOnce(connectionWith(() => Promise.resolve(healthReady("0.0.55"))));
        const middleware = middlewareOf(browserLocalHappyAgentPlugin({ connect }));

        expect((await health(middleware)).status).toBe(503);
        expect((await health(middleware)).status).toBe(200);
        expect(connect).toHaveBeenCalledTimes(2);
    });
});

function previewMiddlewareOf(plugin: ReturnType<typeof browserLocalHappyAgentPlugin>): Middleware {
    let middleware: Middleware | undefined;
    const server = {
        config: { preview: { host: "127.0.0.1", port: 5320 }, server: {} },
        middlewares: {
            use: (handler: Middleware) => {
                middleware = handler;
            },
        },
        httpServer: undefined,
    };
    const configure = (plugin as { configurePreviewServer?: unknown }).configurePreviewServer;
    if (typeof configure !== "function") throw new Error("The plugin registered no preview server.");
    (configure as (value: unknown) => void).call(plugin, server);
    if (!middleware) throw new Error("The plugin registered no middleware.");
    return middleware;
}

async function requestWith(
    middleware: Middleware,
    url: string,
    headers: Record<string, string> = {},
): Promise<Captured & { nextCalled: boolean }> {
    const request = new EventEmitter() as unknown as IncomingMessage;
    Object.assign(request, { method: "GET", url, headers });
    const captured = fakeResponse();
    let nextCalled = false;
    await middleware(request, captured.response, () => {
        nextCalled = true;
    });
    return { ...captured, nextCalled };
}

// ORK-000015 (Orkest Chat embed): the built renderer is served by `vite preview` on lab1 and reached only
// through the GhostShell dashboard, which presents the shared key on every request.
describe("Orkest Chat preview bridge", () => {
    it("serves the daemon bridge from vite preview", async () => {
        const connect = vi
            .fn<() => Promise<LocalHappyAgentConnection>>()
            .mockResolvedValue(connectionWith(() => Promise.resolve(healthReady("0.0.55"))));
        const middleware = previewMiddlewareOf(browserLocalHappyAgentPlugin({ connect }));
        const answered = await requestWith(middleware, `${endpoint}/health`);
        expect(answered.status).toBe(200);
    });

    it("refuses every request without the chat key, assets included, before connecting", async () => {
        const connect = vi.fn<() => Promise<LocalHappyAgentConnection>>();
        const middleware = previewMiddlewareOf(
            browserLocalHappyAgentPlugin({ connect, chatKey: "s3cret-key" }),
        );
        for (const url of ["/", "/assets/index.js", `${endpoint}/health`]) {
            const refused = await requestWith(middleware, url);
            expect(refused.status, url).toBe(401);
            expect(refused.nextCalled, url).toBe(false);
        }
        const wrong = await requestWith(middleware, "/", { "x-orkest-chat-key": "s3cret-kez" });
        expect(wrong.status).toBe(401);
        expect(connect).not.toHaveBeenCalled();
    });

    it("lets a keyed request through to the bridge and to static files", async () => {
        const connect = vi
            .fn<() => Promise<LocalHappyAgentConnection>>()
            .mockResolvedValue(connectionWith(() => Promise.resolve(healthReady("0.0.55"))));
        const middleware = previewMiddlewareOf(
            browserLocalHappyAgentPlugin({ connect, chatKey: "s3cret-key" }),
        );
        const headers = { "x-orkest-chat-key": "s3cret-key" };
        expect((await requestWith(middleware, `${endpoint}/health`, headers)).status).toBe(200);
        const asset = await requestWith(middleware, "/assets/index.js", headers);
        expect(asset.nextCalled).toBe(true);
    });
});
