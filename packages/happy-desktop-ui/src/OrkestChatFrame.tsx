import { useState, type ReactNode } from "react";
import "./styles/orkest-chat-frame.css";

export type OrkestChatFrameProps = {
    /** False leaves the native workspace tree unwrapped. */
    readonly enabled: boolean;
    /** The configured Board address. Missing or unsafe addresses are omitted. */
    readonly boardUrl?: string;
    /** The exact native Happy task for the currently routed conversation. */
    readonly linkedWorkTask?: { readonly id: string; readonly name: string };
    /** The configured global Dossiers index address. It is not a work-item association. */
    readonly dossierUrl?: string;
    /** Truthful state while an explicit native task deep link is resolved. */
    readonly taskHandoffStatus?: "loading" | "disconnected" | "unavailable" | "notFound";
    readonly children: ReactNode;
};

/** Orkest reference chrome is available only in an explicitly opted-in web renderer. */
export function orkestChatReferenceEnabled(
    requested: boolean | undefined,
    platform: "desktop" | "web" | undefined,
): boolean {
    return requested === true && platform === "web";
}

/** Accept only explicit web addresses, with HTTP reserved for loopback development. */
export function orkestChatUrlParse(value: string | undefined): string | undefined {
    if (value === undefined || value.length === 0 || value.trim() !== value) return undefined;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return undefined;
    }
    if (url.username !== "" || url.password !== "" || url.hostname === "") return undefined;
    if (url.protocol === "https:") return url.href;
    if (
        url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
    )
        return url.href;
    return undefined;
}

/** Build the canonical work-context destination only from the launcher-bound Board URL. */
export function orkestWorkContextUrl(
    boardUrlValue: string | undefined,
    taskIdValue: string | undefined,
): string | undefined {
    const boardHref = orkestChatUrlParse(boardUrlValue);
    if (
        taskIdValue === undefined ||
        taskIdValue.length === 0 ||
        taskIdValue.length > 256 ||
        taskIdValue.trim() !== taskIdValue ||
        /[\p{Cc}]/u.test(taskIdValue)
    )
        return undefined;
    if (boardHref === undefined) return undefined;

    const board = new URL(boardHref);
    if (board.pathname.replace(/\/+$/u, "") !== "/x/orkest/board") return undefined;
    const tenantIds = board.searchParams.getAll("tenantId");
    const tenantId = tenantIds[0];
    if (
        tenantIds.length !== 1 ||
        tenantId === undefined ||
        tenantId.length === 0 ||
        tenantId.length > 256 ||
        tenantId.trim() !== tenantId ||
        /[\p{Cc}]/u.test(tenantId)
    )
        return undefined;

    const destination = new URL(board.origin);
    destination.pathname = "/x/orkest/work-context";
    destination.searchParams.set("taskId", taskIdValue);
    destination.searchParams.set("tenantId", tenantId);
    return destination.href;
}

/**
 * Orkest Chat (ORK-000015): GhostShell frames this renderer at /x/orkest/chat and
 * marks the document `data-orkest-embed`. GhostShell then owns the chrome, so the
 * frame drops its own header and inspector and keeps only the task handoff notice.
 */
export function orkestChatEmbedded(
    root: Pick<HTMLElement, "dataset"> | undefined = typeof document === "undefined"
        ? undefined
        : document.documentElement,
): boolean {
    return root?.dataset.orkestEmbed === "1";
}

/** Orkest's optional renderer chrome; its child is the existing native Happy workspace. */
export function OrkestChatFrame(props: OrkestChatFrameProps) {
    const [inspectorOpen, setInspectorOpen] = useState(true);
    if (!props.enabled) return props.children;
    const embedded = orkestChatEmbedded();
    const boardUrl = orkestChatUrlParse(props.boardUrl);
    const dossierUrl = orkestChatUrlParse(props.dossierUrl);
    const workContextUrl = orkestWorkContextUrl(props.boardUrl, props.linkedWorkTask?.id);
    const taskHandoffMessage =
        props.taskHandoffStatus === "loading"
            ? "Looking for that task in this Happy Agent…"
            : props.taskHandoffStatus === "disconnected"
              ? "This Happy Agent is disconnected. Reconnect it to open the requested task."
              : props.taskHandoffStatus === "unavailable"
                ? "The selected Happy Agent or its task list is unavailable."
                : props.taskHandoffStatus === "notFound"
                  ? "That task is not in this Happy Agent’s task list."
                  : undefined;
    if (embedded)
        return (
            <div
                className="orkest-chat-frame orkest-chat-frame--embedded"
                data-orkest-chat-frame="embedded"
            >
                {taskHandoffMessage ? (
                    <p
                        aria-live="polite"
                        className="orkest-chat-frame__handoff"
                        data-testid="orkest-task-handoff"
                        role={props.taskHandoffStatus === "notFound" ? "alert" : "status"}
                    >
                        {taskHandoffMessage}
                    </p>
                ) : null}
                <div className="orkest-chat-frame__body">
                    <div className="orkest-chat-frame__content">{props.children}</div>
                </div>
            </div>
        );
    return (
        <div className="orkest-chat-frame" data-orkest-chat-frame="true">
            <header className="orkest-chat-frame__header">
                <div className="orkest-chat-frame__brand-row">
                    <span className="orkest-chat-frame__brand">Orkest</span>
                </div>
                <div className="orkest-chat-frame__product-row">
                    <div className="orkest-chat-frame__product">
                        <h1 className="orkest-chat-frame__title">Orkest Platform</h1>
                        <p className="orkest-chat-frame__subtitle">People and agents, one team</p>
                    </div>
                    <nav aria-label="Orkest navigation" className="orkest-chat-frame__navigation">
                        <span aria-current="page" className="orkest-chat-frame__navigation-current">
                            Chat
                        </span>
                        {boardUrl ? (
                            <a href={boardUrl} rel="noopener noreferrer" target="_blank">
                                Board
                            </a>
                        ) : null}
                        {dossierUrl ? (
                            <a
                                aria-label="Dossiers index"
                                href={dossierUrl}
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                Dossiers
                            </a>
                        ) : null}
                        {workContextUrl ? (
                            <a
                                aria-label="Open linked work"
                                data-testid="orkest-linked-work"
                                href={workContextUrl}
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                Open linked work
                            </a>
                        ) : null}
                        {props.linkedWorkTask ? (
                            <button
                                aria-expanded={inspectorOpen}
                                aria-controls="orkest-linked-work-inspector"
                                className="orkest-chat-frame__work-toggle"
                                onClick={() => setInspectorOpen((open) => !open)}
                                type="button"
                            >
                                Work
                            </button>
                        ) : null}
                    </nav>
                </div>
            </header>
            {taskHandoffMessage ? (
                <p
                    aria-live="polite"
                    className="orkest-chat-frame__handoff"
                    data-testid="orkest-task-handoff"
                    role={props.taskHandoffStatus === "notFound" ? "alert" : "status"}
                >
                    {taskHandoffMessage}
                </p>
            ) : null}
            <div className="orkest-chat-frame__body">
                <div className="orkest-chat-frame__content">{props.children}</div>
                {props.linkedWorkTask ? (
                    <aside
                        aria-label="Linked work inspector"
                        className="orkest-chat-frame__inspector"
                        data-testid="orkest-linked-work-inspector"
                        hidden={!inspectorOpen}
                        id="orkest-linked-work-inspector"
                    >
                        <div className="orkest-chat-frame__inspector-heading">
                            <h2>Linked work</h2>
                            <button
                                aria-label="Hide linked work inspector"
                                aria-expanded="true"
                                aria-controls="orkest-linked-work-inspector"
                                className="orkest-chat-frame__inspector-close"
                                onClick={() => setInspectorOpen(false)}
                                type="button"
                            >
                                Hide
                            </button>
                        </div>
                        <p className="orkest-chat-frame__inspector-name">
                            {props.linkedWorkTask.name}
                        </p>
                        <dl className="orkest-chat-frame__inspector-identity">
                            <dt>Native task ID</dt>
                            <dd>{props.linkedWorkTask.id}</dd>
                        </dl>
                        {workContextUrl ? (
                            <a
                                className="orkest-chat-frame__inspector-link"
                                href={workContextUrl}
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                Open in Orkest
                            </a>
                        ) : null}
                    </aside>
                ) : null}
            </div>
        </div>
    );
}
