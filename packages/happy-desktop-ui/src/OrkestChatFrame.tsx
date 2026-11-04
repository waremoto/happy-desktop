import type { ReactNode } from "react";
import "./styles/orkest-chat-frame.css";

export type OrkestChatFrameProps = {
    /** False leaves the native workspace tree unwrapped. */
    readonly enabled: boolean;
    /** The configured Board address. Missing or unsafe addresses are omitted. */
    readonly boardUrl?: string;
    /** The configured Dossier address for this real conversation, when known. */
    readonly dossierUrl?: string;
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

/** Orkest's optional renderer chrome; its child is the existing native Happy workspace. */
export function OrkestChatFrame(props: OrkestChatFrameProps) {
    if (!props.enabled) return props.children;
    const boardUrl = orkestChatUrlParse(props.boardUrl);
    const dossierUrl = orkestChatUrlParse(props.dossierUrl);
    return (
        <div className="orkest-chat-frame" data-orkest-chat-frame="true">
            <header className="orkest-chat-frame__header">
                <div className="orkest-chat-frame__identity">
                    <span className="orkest-chat-frame__brand">Orkest</span>
                    <span className="orkest-chat-frame__divider" aria-hidden="true" />
                    <h1 className="orkest-chat-frame__title">Chat</h1>
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
                        <a href={dossierUrl} rel="noopener noreferrer" target="_blank">
                            Dossier
                        </a>
                    ) : null}
                </nav>
            </header>
            <div className="orkest-chat-frame__content">{props.children}</div>
        </div>
    );
}
