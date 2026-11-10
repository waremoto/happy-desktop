/**
 * Orkest Chat embed mode (ORK-000015): this renderer framed same-origin inside
 * GhostShell's Orkest Chat tab (`/x/orkest/chat`). The dashboard serves it under
 * `/proxy/orkest/chat/<tenant>/` and owns the page chrome and the colour mode.
 *
 * The build marks itself with `<meta name="orkest-embed" content="1">` (see
 * `browserDevServer.ts`); nothing here changes the desktop app or a plain
 * browser-local renderer.
 */

const bridgeName = "__happy_local_happy_agent";
const themeMessage = "orkest-chat:theme";

export type OrkestEmbedTheme = "dark" | "light";

/** Whether this document is the GhostShell-framed Orkest Chat build. */
export function orkestEmbedEnabled(doc: Pick<Document, "querySelector">): boolean {
    return doc.querySelector('meta[name="orkest-embed"]')?.getAttribute("content") === "1";
}

/**
 * The bridge endpoint under whatever prefix served this document. Outside the
 * embed it stays the root path the development server has always used.
 */
export function orkestBridgeEndpoint(baseURI: string, embedded: boolean): string {
    if (!embedded) return `/${bridgeName}`;
    return new URL(bridgeName, baseURI).pathname;
}

function themeParse(value: unknown): OrkestEmbedTheme | undefined {
    return value === "dark" || value === "light" ? value : undefined;
}

export interface OrkestEmbedThemeSource {
    get(): OrkestEmbedTheme;
    subscribe(listener: () => void): () => void;
}

type EmbedWindow = Pick<Window, "addEventListener" | "removeEventListener" | "parent"> & {
    readonly location: Pick<Location, "origin" | "search">;
};

/**
 * GhostShell's colour mode, as the embed sees it: `?theme=` on load, then a
 * `{ type: "orkest-chat:theme", theme }` message from the framing GhostShell
 * page on every change. Only the parent window on this same origin is heard.
 */
export function orkestEmbedThemeCreate(
    win: EmbedWindow,
    fallback: () => OrkestEmbedTheme,
): OrkestEmbedThemeSource {
    let theme = themeParse(new URLSearchParams(win.location.search).get("theme")) ?? fallback();
    const listeners = new Set<() => void>();
    win.addEventListener("message", (event: MessageEvent) => {
        if (event.origin !== win.location.origin || event.source !== win.parent) return;
        const data = event.data as { type?: unknown; theme?: unknown } | null;
        if (!data || data.type !== themeMessage) return;
        const next = themeParse(data.theme);
        if (!next || next === theme) return;
        theme = next;
        for (const listener of listeners) listener();
    });
    return {
        get: () => theme,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
