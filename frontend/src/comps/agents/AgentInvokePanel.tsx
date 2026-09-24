import React, { useState } from "react";
import { IconFlask2, IconTerminal2 } from "@tabler/icons-react";
import { AgentOut, AgentPromptOut } from "@/utils/interface/agent.types";
import { CallSnippet } from "@/comps/agents/CallSnippet";
import { AgentTestChat } from "@/comps/agents/AgentTestChat";

interface AgentInvokePanelProps {
    agent: AgentOut;
    activePrompt: AgentPromptOut | null;
    prompts: AgentPromptOut[];
}

type Tab = "snippet" | "test";

export function AgentInvokePanel({ agent, activePrompt, prompts }: AgentInvokePanelProps) {
    const [tab, setTab] = useState<Tab>("snippet");

    const tabButtonClass = (t: Tab) =>
        `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === t ? "bg-[#12251c] text-[#34d399]" : "text-[#7b8698] hover:text-[#e6edf3] hover:bg-[#151b26]"
        }`;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-[#1f2733] pb-3">
                <button type="button" onClick={() => setTab("snippet")} className={tabButtonClass("snippet")}>
                    <IconTerminal2 size={14} />
                    วิธีเรียกใช้
                </button>
                <button type="button" onClick={() => setTab("test")} className={tabButtonClass("test")}>
                    <IconFlask2 size={14} />
                    ทดสอบ Agent
                </button>
            </div>

            {tab === "snippet" ? (
                <CallSnippet agent={agent} activePrompt={activePrompt} prompts={prompts} />
            ) : (
                <AgentTestChat agent={agent} activePrompt={activePrompt} prompts={prompts} />
            )}
        </div>
    );
}
