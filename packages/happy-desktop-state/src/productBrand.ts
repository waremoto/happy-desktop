/**
 * The product's name for its agent, as people read it. Happy by default; a
 * rebranded build (Orkest Chat, ORK-000016) sets its own once at startup,
 * before anything renders.
 *
 * Only display text reads this. The daemon's own data keeps its names: its
 * built-in bot is stored as "Happy", and that name also names folders on disk,
 * so a rebranded build shows the bot under its own name instead of renaming it.
 */

const DEFAULT_AGENT_NAME = "Happy";

let agentName = DEFAULT_AGENT_NAME;

/** The agent's name in copy: "Message Happy…", the author line on its replies. */
export function productAgentName(): string {
    return agentName;
}

/** Sets the agent's name for this window; blank restores the default. */
export function productAgentNameSet(name: string): void {
    const trimmed = name.trim();
    agentName = trimmed.length > 0 ? trimmed : DEFAULT_AGENT_NAME;
}

/**
 * The display name of a bot row: the daemon's built-in bot (the chief of staff,
 * stored as "Happy") reads as the product's agent; every other bot keeps its
 * own name, including a built-in bot its owner renamed.
 */
export function productBotDisplayName(name: string, systemKey?: string | null): string {
    return systemKey === "chief_of_staff" && name === DEFAULT_AGENT_NAME ? agentName : name;
}
