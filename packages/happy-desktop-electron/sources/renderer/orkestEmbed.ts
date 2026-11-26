/**
 * Orkest Chat embed mode (ORK-000015): this renderer framed same-origin inside
 * GhostShell's Orkest Chat tab (`/x/orkest/chat`). The dashboard serves it under
 * `/proxy/orkest/chat/<tenant>/` and owns the page chrome and the colour mode.
 *
 * The build marks itself with `<meta name="orkest-embed" content="1">` (see
 * `browserDevServer.ts`); nothing here changes the desktop app or a plain
 * browser-local renderer.
 */

import {
    productAgentNameSet,
    type ConversationEntry,
    type HappyAgentConversationSnapshot,
    type HappyAgentModelSelection,
    type HappyAgentSessionId,
    type HappyAgentWorkspaceStore,
    type StatusBarPersistence,
    type WelcomePersistence,
} from "happy-desktop-state";

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

/**
 * The welcome deck is Happy's first-run introduction. Inside GhostShell the
 * person is already in Orkest, so the embed always reads as welcomed and never
 * writes the desktop's own `happy.welcome.v1` record.
 */
export function orkestEmbedWelcomePersistence(): WelcomePersistence {
    return {
        read: () => ({ welcomeAcknowledged: true }),
        write: () => undefined,
    };
}

/** Below this frame width the conversation needs the whole frame (GhostShell's phone layout). */
export const ORKEST_EMBED_NARROW_PX = 640;

/**
 * Inside GhostShell the frame can be phone-narrow. The sidebar starts folded
 * there and folds or unfolds only when the frame crosses the breakpoint, so a
 * person's own toggle in between is kept.
 */
export function orkestEmbedSidebarFollow(
    store: { sidebarHiddenUpdate(hidden: boolean): void },
    win: Pick<Window, "addEventListener" | "innerWidth">,
): void {
    let narrow = win.innerWidth < ORKEST_EMBED_NARROW_PX;
    if (narrow) store.sidebarHiddenUpdate(true);
    win.addEventListener("resize", () => {
        const next = win.innerWidth < ORKEST_EMBED_NARROW_PX;
        if (next === narrow) return;
        narrow = next;
        store.sidebarHiddenUpdate(next);
    });
}


/**
 * ORK-000016.4.1 — inside GhostShell the agent is Orkest: its name on replies,
 * the composer's "Message Orkest…" and the built-in bot's row. The daemon's own
 * data (the bot stored as "Happy", the folders it names) is left as it is.
 */
export function orkestEmbedBrandApply(): void {
    productAgentNameSet("Orkest");
}

/**
 * GhostShell owns the colour mode (its header menu), so the embed's status bar
 * never shows Happy's theme menu. Like the welcome record, the desktop's own
 * status-bar record is neither read nor written from the embed.
 */
export function orkestEmbedStatusBarPersistence(): StatusBarPersistence {
    return {
        read: () => ({ themeShown: false, keepAwakeShown: false }),
        write: () => undefined,
    };
}

const scrollMessage = "orkest-chat:scroll-to";
const TURN_ID = /^[A-Za-z0-9._:-]{1,100}$/;

/** Where the conversation should land for a turn: that message's row, at its top (MessageList's restore input). */
export interface OrkestEmbedScrollRow {
    readonly type: "row";
    readonly rowKey: string;
    readonly offset: number;
    /** Distance of the row's top from the viewport's lower edge; MessageList clamps it to the opening height. */
    readonly viewportInset?: number;
}

/**
 * MessageList holds a row `viewportInset` px above the viewport's lower edge and clamps the opening inset to the
 * viewport's height, so an inset taller than any viewport puts the row's top at the viewport's top.
 */
const SCROLL_TOP_INSET = 1_000_000;

export function orkestEmbedScrollRow(rowKey: string): OrkestEmbedScrollRow {
    return { type: "row", rowKey, offset: 0, viewportInset: SCROLL_TOP_INSET };
}

/** A transcript tool call and the run it belongs to (a `ChatElement` of kind `tool_call` fits). */
export interface OrkestEmbedScrollCall {
    readonly toolCallId: string;
    readonly runId: string;
}

/**
 * GHO-205.7.2 — the row the chat lands on for GhostShell's turn (the `propose_document` tool call id): a row keyed by
 * the turn; else the row showing that tool call; else, when its turn is folded, the visible row the fold rides on;
 * else the first row of the call's run; else none.
 */
export function orkestEmbedScrollRowKey(
    turn: string,
    rows: readonly ConversationEntry[],
    calls: readonly OrkestEmbedScrollCall[] = [],
): string | undefined {
    const keyOf = (entry: ConversationEntry) => (entry.kind === "message" ? entry.message.id : entry.id);
    const direct = rows.find(
        (entry) =>
            keyOf(entry) === turn ||
            (entry.kind === "agentActivity" &&
                entry.activity.kind === "tool" &&
                entry.activity.tool.toolCallId === turn),
    );
    if (direct) return keyOf(direct);
    const runId = calls.find((call) => call.toolCallId === turn)?.runId;
    if (runId === undefined) return undefined;
    const fold = rows.find((entry) => entry.traceFoldAnchorId === runId);
    if (fold) return keyOf(fold);
    const first = rows.find((entry) => scrollRunOf(entry) === runId || entry.traceFoldTargetId === runId);
    return first ? keyOf(first) : undefined;
}

function scrollRunOf(entry: ConversationEntry): string | undefined {
    switch (entry.kind) {
        case "message":
        case "turnStatus":
            return entry.runId;
        default:
            return undefined;
    }
}

/** The scroll position for a turn, or none when no row holds it (the chat then stays as it is). */
export function orkestEmbedScrollTarget(
    turn: string,
    rows: readonly ConversationEntry[],
    calls: readonly OrkestEmbedScrollCall[] = [],
): OrkestEmbedScrollRow | undefined {
    const rowKey = orkestEmbedScrollRowKey(turn, rows, calls);
    return rowKey === undefined ? undefined : orkestEmbedScrollRow(rowKey);
}

export interface OrkestEmbedScrollSource {
    /** The last turn GhostShell asked for, until it is taken. */
    take(): string | undefined;
    subscribe(listener: (turn: string) => void): () => void;
}

/**
 * GHO-205.5.3 (Orkest design D-52) — GhostShell's "Show previous" on a doc change asks the chat to scroll to the turn
 * that made it: `{ type: "orkest-chat:scroll-to", turn }` from the framing GhostShell page on this same origin. Only
 * the parent window is heard and only a well-formed message id passes; the listener gets the turn, and the turn stays
 * pending (`take`) for a conversation that opens after the message arrived.
 */
export function orkestEmbedScrollCreate(win: EmbedWindow): OrkestEmbedScrollSource {
    let pending: string | undefined;
    const listeners = new Set<(turn: string) => void>();
    win.addEventListener("message", (event: MessageEvent) => {
        if (event.origin !== win.location.origin || event.source !== win.parent) return;
        const data = event.data as { type?: unknown; turn?: unknown } | null;
        if (!data || data.type !== scrollMessage) return;
        if (typeof data.turn !== "string" || !TURN_ID.test(data.turn)) return;
        pending = data.turn;
        for (const listener of listeners) listener(data.turn);
    });
    return {
        take() {
            const turn = pending;
            pending = undefined;
            return turn;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

const modelMessage = "orkest-chat:model";

/** GhostShell's model lanes, named as the Claude models' ids name them. */
export type OrkestEmbedLane = "haiku" | "sonnet" | "opus";

export interface OrkestEmbedModelSource {
    subscribe(listener: (lane: OrkestEmbedLane) => void): () => void;
}

/**
 * GHO-205.7.2 — GhostShell's model picker: `{ type: "orkest-chat:model", lane }` from the framing GhostShell page on
 * this same origin, with lane one of haiku, sonnet or opus. Anything else is ignored.
 */
export function orkestEmbedModelCreate(win: EmbedWindow): OrkestEmbedModelSource {
    const listeners = new Set<(lane: OrkestEmbedLane) => void>();
    win.addEventListener("message", (event: MessageEvent) => {
        if (event.origin !== win.location.origin || event.source !== win.parent) return;
        const data = event.data as { type?: unknown; lane?: unknown } | null;
        if (!data || data.type !== modelMessage) return;
        const lane = data.lane;
        if (lane !== "haiku" && lane !== "sonnet" && lane !== "opus") return;
        for (const listener of listeners) listener(lane);
    });
    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

/** The newest model of `providerId` whose id names the lane, as the selection `sessionModelUpdate` takes. */
/** The part of a model catalog a lane is resolved in (a `HappyAgentModelCatalog` fits). */
export interface OrkestEmbedModelCatalog {
    readonly providers: readonly {
        readonly id: string;
        readonly models: readonly { readonly id: string }[];
    }[];
}

export function orkestEmbedModelFor(
    lane: OrkestEmbedLane,
    catalog: OrkestEmbedModelCatalog,
    providerId: string,
): HappyAgentModelSelection | undefined {
    const provider = catalog.providers.find((candidate) => candidate.id === providerId);
    const model = provider?.models.find((candidate) => candidate.id.includes(lane));
    return model ? { providerId, modelId: model.id } : undefined;
}

type OrkestEmbedWorkspace = Pick<
    HappyAgentWorkspaceStore,
    "get" | "subscribe" | "conversationScrollJump" | "conversationToolCallRuns" | "sessionModelUpdate" | "draftAppend"
>;

/** The workspace on screen, which changes as the Happy Agent connects or reconnects. */
export interface OrkestEmbedWorkspaceSource {
    get(): OrkestEmbedWorkspace | undefined;
    subscribe(listener: () => void): () => void;
}

/** The open conversation once its own transcript is read (not a stand-in kept from an earlier visit). */
function openConversation(workspace: OrkestEmbedWorkspace): HappyAgentConversationSnapshot | undefined {
    const conversation = workspace.get().conversation;
    if (conversation.type !== "ready") return undefined;
    const value = conversation.value;
    return value.ready && value.standIn !== true ? value : undefined;
}

/**
 * The menus a conversation offers, as the catalog a lane resolves in: the pickers' models in catalog order, without
 * hidden or switched-off ones.
 */
function menusCatalog(conversation: HappyAgentConversationSnapshot): OrkestEmbedModelCatalog {
    const providers = new Map<string, { id: string }[]>();
    for (const option of conversation.menus?.modelOptions ?? []) {
        if (option.disabled) continue;
        const models = providers.get(option.providerId) ?? [];
        models.push({ id: option.modelId });
        providers.set(option.providerId, models);
    }
    return { providers: [...providers].map(([id, models]) => ({ id, models })) };
}

/**
 * GHO-205.7.2 — what GhostShell asks of the framed chat. A scroll-to lands the open conversation on the turn's row
 * now, or the conversation that opens next when none is open; a turn with no row leaves the chat as it is. A model
 * lane switches the open conversation to its provider's newest model for that lane; one that resolves to nothing,
 * or to the model already chosen, changes nothing.
 */
export function orkestEmbedChatFollow(input: {
    readonly scroll: OrkestEmbedScrollSource;
    readonly model: OrkestEmbedModelSource;
    readonly workspace: OrkestEmbedWorkspaceSource;
    readonly compose?: OrkestEmbedComposeSource;
}): () => void {
    const { scroll, model, workspace, compose } = input;
    let followed: OrkestEmbedWorkspace | undefined;
    let followedStop: (() => void) | undefined;
    let openSeen: HappyAgentSessionId | undefined;

    const scrollApply = (turn: string, target: OrkestEmbedWorkspace, open: HappyAgentConversationSnapshot) => {
        const position = orkestEmbedScrollTarget(turn, open.entries, target.conversationToolCallRuns());
        if (position) target.conversationScrollJump(open.conversationId, position);
    };
    /* A suggestion joins the draft (draftAppend keeps what the person already typed). */
    const composeApply = (text: string, target: OrkestEmbedWorkspace, open: HappyAgentConversationSnapshot) => {
        void target.draftAppend(open.conversationId, text).catch(() => undefined);
    };
    /* A turn that came before its conversation opened is applied once, as it opens. */
    const openFollow = () => {
        const target = workspace.get();
        const open = target && openConversation(target);
        if (!target || !open) {
            openSeen = undefined;
            return;
        }
        if (open.conversationId === openSeen) return;
        openSeen = open.conversationId;
        const turn = scroll.take();
        if (turn !== undefined) scrollApply(turn, target, open);
        const text = compose?.take();
        if (text !== undefined) composeApply(text, target, open);
    };
    const workspaceFollow = () => {
        const target = workspace.get();
        if (target !== followed) {
            followedStop?.();
            followed = target;
            followedStop = target?.subscribe(openFollow);
        }
        openFollow();
    };

    const stops = [
        workspace.subscribe(workspaceFollow),
        scroll.subscribe(() => {
            const target = workspace.get();
            const open = target && openConversation(target);
            if (!target || !open) return;
            const turn = scroll.take();
            if (turn !== undefined) scrollApply(turn, target, open);
        }),
        model.subscribe((lane) => {
            const target = workspace.get();
            const open = target && openConversation(target);
            const menus = open?.menus;
            if (!target || !open || !menus) return;
            const selection = orkestEmbedModelFor(lane, menusCatalog(open), menus.currentProviderId);
            if (!selection || selection.modelId === menus.currentModelId) return;
            target.sessionModelUpdate(selection);
        }),
        compose?.subscribe(() => {
            const target = workspace.get();
            const open = target && openConversation(target);
            if (!target || !open) return;
            const text = compose.take();
            if (text !== undefined) composeApply(text, target, open);
        }) ?? (() => undefined),
    ];
    workspaceFollow();
    return () => {
        for (const stop of stops) stop();
        followedStop?.();
    };
}

const composeMessage = "orkest-chat:compose";
/** The longest suggestion GhostShell may put in the composer. */
export const ORKEST_EMBED_COMPOSE_MAX = 4000;

export interface OrkestEmbedComposeSource {
    /** The last suggestion GhostShell sent, until it is taken. */
    take(): string | undefined;
    subscribe(listener: (text: string) => void): () => void;
}

/**
 * GHO-207.3.2 — GhostShell's "No roadmap yet" action suggests a first message: `{ type: "orkest-chat:compose", text }`
 * from the framing GhostShell page on this same origin. Only the parent window is heard, and only non-blank text up to
 * {@link ORKEST_EMBED_COMPOSE_MAX} characters passes. The text stays pending (`take`) for a conversation that opens
 * after the message arrived.
 */
export function orkestEmbedComposeCreate(win: EmbedWindow): OrkestEmbedComposeSource {
    let pending: string | undefined;
    const listeners = new Set<(text: string) => void>();
    win.addEventListener("message", (event: MessageEvent) => {
        if (event.origin !== win.location.origin || event.source !== win.parent) return;
        const data = event.data as { type?: unknown; text?: unknown } | null;
        if (!data || data.type !== composeMessage) return;
        if (typeof data.text !== "string") return;
        const text = data.text.trim();
        if (text.length === 0 || text.length > ORKEST_EMBED_COMPOSE_MAX) return;
        pending = text;
        for (const listener of listeners) listener(text);
    });
    return {
        take() {
            const text = pending;
            pending = undefined;
            return text;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

const workItemMessage = "orkest-chat:work-item";

/** The work item a ticket chat is about, as its chip names it. */
export interface OrkestEmbedWorkItem {
    readonly label: string;
    readonly title: string;
}

export interface OrkestEmbedWorkItemSource {
    get(): OrkestEmbedWorkItem | null;
    subscribe(listener: (item: OrkestEmbedWorkItem | null) => void): () => void;
}

function workItemParse(value: unknown): OrkestEmbedWorkItem | null | undefined {
    if (value === null) return null;
    if (!value || typeof value !== "object") return undefined;
    const { label, title } = value as { label?: unknown; title?: unknown };
    if (typeof label !== "string" || typeof title !== "string") return undefined;
    const cleanLabel = label.trim();
    const cleanTitle = title.trim();
    if (cleanLabel.length === 0 || cleanLabel.length > 40 || cleanTitle.length > 200) return undefined;
    return { label: cleanLabel, title: cleanTitle };
}

/**
 * GHO-207.3.1 — the work item a ticket chat is about: `{ type: "orkest-chat:work-item", item }` from the framing
 * GhostShell page, with item `{ label, title }`, or null when the chat is not about one. The chat shows it as a chip
 * above the composer instead of a drafted message.
 */
export function orkestEmbedWorkItemCreate(win: EmbedWindow): OrkestEmbedWorkItemSource {
    let current: OrkestEmbedWorkItem | null = null;
    const listeners = new Set<(item: OrkestEmbedWorkItem | null) => void>();
    win.addEventListener("message", (event: MessageEvent) => {
        if (event.origin !== win.location.origin || event.source !== win.parent) return;
        const data = event.data as { type?: unknown; item?: unknown } | null;
        if (!data || data.type !== workItemMessage) return;
        const item = workItemParse(data.item);
        if (item === undefined) return;
        current = item;
        for (const listener of listeners) listener(item);
    });
    return {
        get: () => current,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

const COMPOSER_SELECTOR = '[data-happy-desktop-ui="composer"]';
export const ORKEST_EMBED_WORK_ITEM_ID = "orkest-work-item";

/** The few DOM members the chip needs, so the placement runs against a fake in tests. */
export interface OrkestEmbedChipDocument {
    querySelector(selector: string): OrkestEmbedChipElement | null;
    getElementById(id: string): OrkestEmbedChipElement | null;
    createElement(tag: "div"): OrkestEmbedChipElement;
}

export interface OrkestEmbedChipElement {
    id: string;
    textContent: string | null;
    title: string;
    readonly style: { cssText: string };
    setAttribute(name: string, value: string): void;
    readonly nextElementSibling: unknown;
    readonly parentElement: { insertBefore(node: unknown, before: unknown): unknown } | null;
    remove(): void;
}

const CHIP_STYLE =
    "display:inline-flex;align-items:center;gap:6px;max-width:calc(100% - 24px);margin:0 12px 6px;" +
    "padding:2px 10px;border:1px solid currentColor;border-radius:999px;font-size:12px;line-height:18px;" +
    "opacity:0.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;align-self:flex-start;";

/**
 * Show the work item as a chip right above the composer, or remove the chip for null. It is placed again when the
 * composer is re-rendered somewhere else; a document with no composer yet shows nothing.
 */
export function orkestEmbedWorkItemPlace(doc: OrkestEmbedChipDocument, item: OrkestEmbedWorkItem | null): void {
    const existing = doc.getElementById(ORKEST_EMBED_WORK_ITEM_ID);
    if (item === null) {
        existing?.remove();
        return;
    }
    const composer = doc.querySelector(COMPOSER_SELECTOR);
    if (!composer?.parentElement) return;
    const chip = existing ?? doc.createElement("div");
    if (!existing) {
        chip.id = ORKEST_EMBED_WORK_ITEM_ID;
        chip.setAttribute("data-orkest-work-item", "");
        chip.setAttribute("role", "note");
        chip.style.cssText = CHIP_STYLE;
    }
    const text = item.title ? `${item.label} · ${item.title}` : item.label;
    if (chip.textContent !== text) chip.textContent = text;
    if (chip.title !== `This chat is about ${text}`) {
        chip.title = `This chat is about ${text}`;
        chip.setAttribute("aria-label", `Work item ${text}`);
    }
    if (chip.nextElementSibling !== composer) composer.parentElement.insertBefore(chip, composer);
}

/**
 * Keep the chip in place: on every work item GhostShell sends and whenever the document changes (`observe` is a
 * MutationObserver over the body in the app).
 */
export function orkestEmbedWorkItemFollow(input: {
    readonly doc: OrkestEmbedChipDocument;
    readonly source: OrkestEmbedWorkItemSource;
    readonly observe: (callback: () => void) => () => void;
}): () => void {
    const place = () => orkestEmbedWorkItemPlace(input.doc, input.source.get());
    const stops = [input.source.subscribe(place), input.observe(place)];
    place();
    return () => {
        for (const stop of stops) stop();
    };
}
