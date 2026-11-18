import { createContext, useContext } from "react";

export const OrkestApprovalTask = createContext<
    { readonly id: string; readonly conversationId?: string } | undefined
>(undefined);

/** Only the open Happy task can host its dashboard decision controls. */
export function OrkestConversationApproval(props: { conversationId: string }) {
    const task = useContext(OrkestApprovalTask);
    if (!task || task.conversationId !== props.conversationId) return null;
    const path = new URL(document.baseURI).pathname;
    const tenant = /^\/proxy\/orkest\/chat\/([^/]+)\//u.exec(path)?.[1];
    if (!tenant) return null;
    const query = new URLSearchParams({ tenantId: decodeURIComponent(tenant), taskId: task.id });
    return (
        <iframe
            key={query.toString()}
            className="orkest-conversation-approval"
            src={`/x/orkest/chat-approval?${query}`}
            title="Approval request"
        />
    );
}
