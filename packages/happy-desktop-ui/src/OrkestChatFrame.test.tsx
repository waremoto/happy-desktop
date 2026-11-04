import { expect, it } from "vitest";
import { useState } from "react";
import { userEvent } from "vitest/browser";
import "./theme.css";
import { OrkestChatFrame, orkestChatReferenceEnabled, orkestChatUrlParse } from "./OrkestChatFrame";
import { createRenderer } from "./testing";

it("keeps unavailable destinations out of the navigation and rejects unsafe URLs", async () => {
    const view = createRenderer().render(
        () => (
            <OrkestChatFrame
                boardUrl="javascript:alert(1)"
                dossierUrl="//evil.example/path"
                enabled
            >
                <div data-testid="native-chat">Native conversation</div>
            </OrkestChatFrame>
        ),
        { width: 920, height: 640, padding: 0 },
    );
    await view.ready();

    expect(view.$('[data-testid="native-chat"]').element.textContent).toBe("Native conversation");
    expect(view.$('[aria-label="Orkest navigation"]').element.querySelectorAll("a").length).toBe(0);
    expect(view.$('[aria-current="page"]').element.textContent).toBe("Chat");
    expect(orkestChatUrlParse("javascript:alert(1)")).toBeUndefined();
    expect(orkestChatUrlParse("//evil.example/path")).toBeUndefined();
    expect(orkestChatUrlParse("https://user:secret@example.com")).toBeUndefined();
});

it("shows only explicit validated Board and Dossier links", async () => {
    const view = createRenderer().render(
        () => (
            <OrkestChatFrame
                boardUrl="http://localhost:3002/x/orkest/board"
                dossierUrl="https://orkest.example/dossiers/actual"
                enabled
            >
                <div>Conversation body</div>
            </OrkestChatFrame>
        ),
        { width: 920, height: 640, padding: 0 },
    );
    await view.ready();

    expect(view.$('[aria-label="Orkest navigation"]').element.querySelectorAll("a").length).toBe(2);
    expect(view.$('a[href="http://localhost:3002/x/orkest/board"]').element.textContent).toBe(
        "Board",
    );
    expect(view.$('a[href="https://orkest.example/dossiers/actual"]').element.textContent).toBe(
        "Dossier",
    );
    expect(
        view.$('a[href="https://orkest.example/dossiers/actual"]').element.getAttribute("rel"),
    ).toBe("noopener noreferrer");
    expect(orkestChatUrlParse("data:text/html,hi")).toBeUndefined();
    expect(orkestChatUrlParse("https://orkest.example/path")).toBe("https://orkest.example/path");
});

it("returns the original workspace child when the opt-in is disabled", async () => {
    const view = createRenderer().render(
        () => (
            <OrkestChatFrame enabled={false} boardUrl="https://orkest.example/board">
                <button data-testid="native-control">Native control</button>
            </OrkestChatFrame>
        ),
        { width: 480, height: 220, padding: 0 },
    );
    await view.ready();

    expect(view.container.querySelector("[data-orkest-chat-frame]")).toBeNull();
    expect(view.$('[data-testid="native-control"]').element.textContent).toBe("Native control");
});

it("enables the renderer mode only for an explicitly opted-in web surface", () => {
    expect(orkestChatReferenceEnabled(true, "web")).toBe(true);
    expect(orkestChatReferenceEnabled(false, "web")).toBe(false);
    expect(orkestChatReferenceEnabled(undefined, "web")).toBe(false);
    expect(orkestChatReferenceEnabled(true, "desktop")).toBe(false);
    expect(orkestChatReferenceEnabled(true, undefined)).toBe(false);
});

it("preserves child DOM identity and local state when configured links update", async () => {
    function Harness() {
        const [linkVersion, setLinkVersion] = useState(0);
        const [value, setValue] = useState("draft");
        return (
            <>
                <button data-testid="change-links" onClick={() => setLinkVersion(linkVersion + 1)}>
                    Change links
                </button>
                <OrkestChatFrame boardUrl={`https://orkest.example/board/${linkVersion}`} enabled>
                    <input
                        data-testid="native-draft"
                        onChange={(event) => setValue(event.currentTarget.value)}
                        value={value}
                    />
                </OrkestChatFrame>
            </>
        );
    }
    const view = createRenderer().render(() => <Harness />, {
        width: 920,
        height: 640,
        padding: 0,
    });
    await view.ready();
    const input = view.$('[data-testid="native-draft"]').element;
    await userEvent.type(input, " text");
    await userEvent.click(view.$('[data-testid="change-links"]').element);

    expect(view.$('[data-testid="native-draft"]').element).toBe(input);
    expect(view.$('[data-testid="native-draft"]').element).toHaveValue("draft text");
    expect(view.$('a[href="https://orkest.example/board/1"]').element.textContent).toBe("Board");
});
