import { expect, it } from "vitest";
import { useState } from "react";
import { userEvent } from "vitest/browser";
import "./theme.css";
import {
    OrkestChatFrame,
    orkestChatEmbedded,
    orkestChatReferenceEnabled,
    orkestChatUrlParse,
    orkestWorkContextUrl,
} from "./OrkestChatFrame";
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

    expect(view.$(".orkest-chat-frame__brand-row").element.textContent).toBe("Orkest");
    expect(view.$(".orkest-chat-frame__product-row").element.textContent).toContain(
        "Orkest Platform",
    );
    expect(view.$(".orkest-chat-frame__subtitle").element.textContent).toBe(
        "People and agents, one team",
    );
    expect(
        view
            .$(".orkest-chat-frame__product-row")
            .element.querySelector('[aria-label="Orkest navigation"]'),
    ).not.toBeNull();
    expect(view.$('[aria-label="Orkest navigation"]').element.querySelectorAll("a").length).toBe(2);
    expect(view.$('a[href="http://localhost:3002/x/orkest/board"]').element.textContent).toBe(
        "Board",
    );
    expect(view.$('a[href="https://orkest.example/dossiers/actual"]').element.textContent).toBe(
        "Dossiers",
    );
    expect(
        view
            .$('a[href="https://orkest.example/dossiers/actual"]')
            .element.getAttribute("aria-label"),
    ).toBe("Dossiers index");
    expect(
        view.$('a[href="https://orkest.example/dossiers/actual"]').element.getAttribute("rel"),
    ).toBe("noopener noreferrer");
    expect(orkestChatUrlParse("data:text/html,hi")).toBeUndefined();
    expect(orkestChatUrlParse("https://orkest.example/path")).toBe("https://orkest.example/path");
});

it("opens linked work only from a tenant-bound canonical Board address", async () => {
    const boardUrl = "https://orkest.example/x/orkest/board?tenantId=tenant%2Fone&discard=1";
    const view = createRenderer().render(
        () => (
            <OrkestChatFrame
                boardUrl={boardUrl}
                enabled
                linkedWorkTask={{ id: "task 7", name: "Task name" }}
            >
                <div>Conversation body</div>
            </OrkestChatFrame>
        ),
        { width: 920, height: 640, padding: 0 },
    );
    await view.ready();

    const link = view.$('[data-testid="orkest-linked-work"]').element;
    expect(link.textContent).toBe("Open linked work");
    expect(new URL(link.getAttribute("href") as string).pathname).toBe("/x/orkest/work-context");
    expect(new URL(link.getAttribute("href") as string).searchParams.get("taskId")).toBe("task 7");
    expect(new URL(link.getAttribute("href") as string).searchParams.get("tenantId")).toBe(
        "tenant/one",
    );
    expect(new URL(link.getAttribute("href") as string).searchParams.get("discard")).toBeNull();
    expect(orkestWorkContextUrl("https://orkest.example/x/orkest/board", "task")).toBeUndefined();
    expect(
        orkestWorkContextUrl("https://orkest.example/x/orkest/board?tenantId=a&tenantId=b", "task"),
    ).toBeUndefined();
    expect(
        orkestWorkContextUrl("https://orkest.example/elsewhere?tenantId=a", "task"),
    ).toBeUndefined();
});

it("docks the inspector on wide workbenches and overlays it on compact ones", async () => {
    function Harness() {
        const [task, setTask] = useState({ id: "task-1", name: "Selected task" });
        return (
            <>
                <button
                    data-testid="select-next-task"
                    onClick={() => setTask({ id: "task-2", name: "Next selected task" })}
                >
                    Select next task
                </button>
                <OrkestChatFrame
                    boardUrl="https://orkest.example/x/orkest/board?tenantId=tenant-1"
                    enabled
                    linkedWorkTask={task}
                >
                    <div data-testid="native-workspace">Native workspace</div>
                </OrkestChatFrame>
            </>
        );
    }

    for (const width of [1280, 920, 720]) {
        const view = createRenderer().render(() => <Harness />, {
            width,
            height: 720,
            padding: 0,
        });
        await view.ready();
        const body = view.container.querySelector(".orkest-chat-frame__body");
        const workspace = view.$('[data-testid="native-workspace"]').element;
        const inspector = view.$('[data-testid="orkest-linked-work-inspector"]').element;
        if (width === 1280) {
            expect(getComputedStyle(inspector).position).toBe("static");
            expect(workspace.getBoundingClientRect().right).toBeLessThanOrEqual(
                inspector.getBoundingClientRect().left,
            );
        } else {
            expect(getComputedStyle(inspector).position).toBe("absolute");
            expect(body?.getBoundingClientRect().width).toBe(
                workspace.getBoundingClientRect().width,
            );
        }
        expect(Number.parseFloat(getComputedStyle(inspector).width)).toBeLessThanOrEqual(
            width === 720 ? 240 : 304,
        );
        expect(view.$('[aria-label="Open linked work"]').element.getAttribute("href")).toContain(
            "/x/orkest/work-context?taskId=task-1&tenantId=tenant-1",
        );
        await userEvent.click(view.$('[data-testid="select-next-task"]').element);
        expect(
            view.$('[data-testid="orkest-linked-work-inspector"]').element.textContent,
        ).toContain("Next selected task");
        expect(view.$('[aria-label="Open linked work"]').element.getAttribute("href")).toContain(
            "taskId=task-2",
        );
    }
});

it("states when an explicit task handoff cannot be resolved yet", async () => {
    const view = createRenderer().render(
        () => (
            <OrkestChatFrame enabled taskHandoffStatus="disconnected">
                <div data-testid="native-chat">Native conversation</div>
            </OrkestChatFrame>
        ),
        { width: 920, height: 640, padding: 0 },
    );
    await view.ready();

    expect(view.$('[data-testid="orkest-task-handoff"]').element.textContent).toContain(
        "Happy Agent is disconnected",
    );
    expect(view.$('[data-testid="native-chat"]').element.textContent).toBe("Native conversation");
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

// ORK-000015: framed by GhostShell, the frame keeps no chrome of its own.
it("drops its header and inspector when GhostShell embeds it", async () => {
    document.documentElement.dataset.orkestEmbed = "1";
    try {
        expect(orkestChatEmbedded()).toBe(true);
        const view = createRenderer().render(
            () => (
                <OrkestChatFrame
                    boardUrl="http://localhost:3002/x/orkest/board?tenantId=maremoto"
                    enabled
                    linkedWorkTask={{ id: "mm_1", name: "MM-1" }}
                    taskHandoffStatus="loading"
                >
                    <div data-testid="native-chat">Native conversation</div>
                </OrkestChatFrame>
            ),
            { width: 390, height: 640, padding: 0 },
        );
        await view.ready();
        expect(view.$('[data-testid="native-chat"]').element.textContent).toBe("Native conversation");
        const frame = document.querySelector('[data-orkest-chat-frame]');
        expect(frame?.getAttribute("data-orkest-chat-frame")).toBe("embedded");
        expect(frame?.querySelector("header")).toBeNull();
        expect(frame?.querySelector('[data-testid="orkest-linked-work-inspector"]')).toBeNull();
        expect(frame?.querySelector('[data-testid="orkest-task-handoff"]')).not.toBeNull();
    } finally {
        delete document.documentElement.dataset.orkestEmbed;
    }
    expect(orkestChatEmbedded()).toBe(false);
});
