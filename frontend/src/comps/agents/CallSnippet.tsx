import React, { useState } from "react";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import { AgentOut, AgentPromptOut } from "@/utils/interface/agent.types";
import { buildAgentChatUrl } from "@/utils/api/agentInvoke";
import { inputClass, labelClass } from "@/comps/agents/formStyles";

interface CallSnippetProps {
    agent: AgentOut;
    activePrompt: AgentPromptOut | null;
    prompts: AgentPromptOut[];
}

export function CallSnippet({ agent, activePrompt, prompts }: CallSnippetProps) {
    const [copied, setCopied] = useState(false);
    const [versionMode, setVersionMode] = useState<"active" | number>("active");

    const version = versionMode === "active" ? null : versionMode;
    const endpoint = buildAgentChatUrl(agent.slug, version);
    const payload = { message: "<ข้อความจากผู้ใช้>", stream: true };

    const curlSnippet = `curl -N -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(curlSnippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // clipboard unavailable, ignore
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3 text-xs text-[#7b8698]">
                <p>
                    {activePrompt ? (
                        <>
                            เรียก Agent นี้ได้โดยตรง — เลือกได้ว่าจะใช้ system prompt เวอร์ชัน active หรือระบุเวอร์ชันที่ต้องการตรงๆ พร้อม
                            generation config ปัจจุบัน ผลลัพธ์จะ stream กลับมาแบบ SSE (Server-Sent Events)
                        </>
                    ) : (
                        <>Agent นี้ยังไม่มี system prompt เวอร์ชัน active — เพิ่มและตั้ง active ก่อนจึงจะเรียกใช้ได้</>
                    )}
                </p>
                <button
                    onClick={handleCopy}
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#1f2733] text-[#a3aebc] hover:text-[#e6edf3] hover:bg-[#151b26] transition-colors"
                >
                    {copied ? <IconCheck size={14} className="text-[#34d399]" /> : <IconCopy size={14} />}
                    {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                </button>
            </div>

            <label className={`${labelClass} max-w-xs`}>
                เวอร์ชัน Prompt ที่จะเรียก
                <select
                    className={inputClass}
                    value={versionMode}
                    onChange={(e) => setVersionMode(e.target.value === "active" ? "active" : Number(e.target.value))}
                >
                    <option value="active">
                        Active{activePrompt ? ` (v${activePrompt.version})` : ""} — ใช้ /chat
                    </option>
                    {prompts.map((p) => (
                        <option key={p.id} value={p.version}>
                            v{p.version} เจาะจง — ใช้ /versions/{p.version}/chat
                        </option>
                    ))}
                </select>
            </label>

            <pre className="bg-[#0a0e14] border border-[#1f2733] rounded-xl p-4 text-xs text-[#e6edf3] overflow-x-auto whitespace-pre">
                {curlSnippet}
            </pre>
            <div className="text-xs text-[#7b8698] flex flex-col gap-1">
                <span>
                    เรียกแบบไม่ stream: เพิ่ม <code className="text-[#a3aebc] font-mono">&quot;stream&quot;: false</code> ใน body — จะได้ JSON ก้อนเดียวกลับมาแทน
                </span>
            </div>
        </div>
    );
}
