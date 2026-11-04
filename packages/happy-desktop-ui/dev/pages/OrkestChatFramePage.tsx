import { OrkestChatFrame } from "../../src/OrkestChatFrame";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "P-022";

export function OrkestChatFramePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Optional Orkest navigation around Happy's existing chat workspace."
            title="Orkest chat frame"
            width={1280}
        >
            <FullScreenSpecimen
                detail="The child slot is supplied by the native Happy workspace."
                label="Chat shell"
                number={componentNumber}
                screen="orkest-chat-frame"
                window={{ height: 800, width: 1280 }}
            >
                <OrkestChatFrame boardUrl="http://localhost:3002/x/orkest/board" enabled>
                    <div aria-label="Native Happy workspace slot" />
                </OrkestChatFrame>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
