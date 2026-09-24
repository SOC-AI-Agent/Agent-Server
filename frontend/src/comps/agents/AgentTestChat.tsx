import React, { useEffect, useRef, useState } from "react";
import { IconLoader2, IconPlayerStop, IconSend, IconTrash } from "@tabler/icons-react";
import { AgentOut, AgentPromptOut } from "@/utils/interface/agent.types";
import { AgentChatDone, streamAgentChat } from "@/utils/api/agentInvoke";
import { inputClass, labelClass, primaryButtonClass, ghostButtonClass } from "@/comps/agents/formStyles";

interface AgentTestChatProps {
    agent: AgentOut;
    activePrompt: AgentPromptOut | null;
    prompts: AgentPromptOut[];
}

interface TestMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    version?: number;
    stats?: AgentChatDone;
    error?: string;
    pending?: boolean;
}

export function AgentTestChat({ agent, activePrompt, prompts }: AgentTestChatProps) {
    const [versionMode, setVersionMode] = useState<"active" | number>("active");
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState<TestMessage[]>([]);
    const [sending, setSending] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const resolvedVersion = versionMode === "active" ? null : versionMode;
    const canSend = !!activePrompt && !!message.trim() && !sending;

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSend) return;

        const text = message.trim();
        setMessage("");
        setSending(true);

        const userMsgId = crypto.randomUUID();
        const assistantMsgId = crypto.randomUUID();
        setMessages((prev) => [
            ...prev,
            { id: userMsgId, role: "user", content: text },
            { id: assistantMsgId, role: "assistant", content: "", pending: true, version: resolvedVersion ?? activePrompt?.version },
        ]);

        const controller = new AbortController();
        abortRef.current = controller;

        await streamAgentChat(
            agent.slug,
            resolvedVersion,
            text,
            {
                onToken: (chunk) => {
                    setMessages((prev) =>
                        prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m)),
                    );
                },
                onDone: (stats) => {
                    setMessages((prev) =>
                        prev.map((m) => (m.id === assistantMsgId ? { ...m, pending: false, stats } : m)),
                    );
                },
                onError: (err) => {
                    setMessages((prev) =>
                        prev.map((m) => (m.id === assistantMsgId ? { ...m, pending: false, error: err } : m)),
                    );
                },
            },
            controller.signal,
        );

        abortRef.current = null;
        setSending(false);
    };

    const handleStop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setSending(false);
        setMessages((prev) => prev.map((m) => (m.pending ? { ...m, pending: false } : m)));
    };

    const handleClear = () => {
        abortRef.current?.abort();
        setMessages([]);
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
                <label className={`${labelClass} max-w-xs`}>
                    เวอร์ชัน Prompt ที่จะทดสอบ
                    <select
                        className={inputClass}
                        value={versionMode}
                        onChange={(e) => setVersionMode(e.target.value === "active" ? "active" : Number(e.target.value))}
                        disabled={sending}
                    >
                        <option value="active">Active{activePrompt ? ` (v${activePrompt.version})` : ""}</option>
                        {prompts.map((p) => (
                            <option key={p.id} value={p.version}>
                                v{p.version}
                            </option>
                        ))}
                    </select>
                </label>
                {messages.length > 0 && (
                    <button type="button" onClick={handleClear} className={ghostButtonClass}>
                        <IconTrash size={12} className="inline mr-1 -mt-0.5" />
                        ล้างประวัติ
                    </button>
                )}
            </div>

            <div className="bg-[#0a0e14] border border-[#1f2733] rounded-xl p-3 h-80 overflow-y-auto flex flex-col gap-3">
                {messages.length === 0 && (
                    <p className="text-xs text-[#5b6472] m-auto">
                        {activePrompt ? "พิมพ์ข้อความด้านล่างเพื่อทดสอบ Agent" : "Agent นี้ยังไม่มี system prompt เวอร์ชัน active"}
                    </p>
                )}
                {messages.map((m) => (
                    <div key={m.id} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                        <div
                            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                                m.role === "user" ? "bg-[#12251c] text-[#e6edf3]" : "bg-[#151b26] text-[#e6edf3]"
                            }`}
                        >
                            {m.role === "assistant" && m.version != null && (
                                <div className="text-[10px] font-mono text-[#5b6472] mb-1">v{m.version}</div>
                            )}
                            {m.content}
                            {m.pending && !m.content && <IconLoader2 size={14} className="inline animate-spin text-[#7b8698]" />}
                            {m.pending && m.content && <span className="inline-block w-1.5 h-3.5 bg-[#34d399] ml-0.5 animate-pulse align-middle" />}
                            {m.error && <span className="text-[#f87171] text-xs block mt-1">เกิดข้อผิดพลาด: {m.error}</span>}
                        </div>
                        {m.stats && (
                            <span className="text-[10px] text-[#5b6472] font-mono">
                                {m.stats.latency_ms}ms
                                {m.stats.total_tokens != null && ` · ${m.stats.total_tokens} tokens`}
                            </span>
                        )}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} className="flex items-end gap-2">
                <textarea
                    className={`${inputClass} flex-1 resize-none`}
                    rows={2}
                    placeholder={activePrompt ? "พิมพ์ข้อความทดสอบ..." : "Agent นี้ยังใช้งานไม่ได้"}
                    value={message}
                    disabled={!activePrompt || sending}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend(e);
                        }
                    }}
                />
                {sending ? (
                    <button type="button" onClick={handleStop} className={primaryButtonClass}>
                        <IconPlayerStop size={14} className="inline mr-1 -mt-0.5" />
                        หยุด
                    </button>
                ) : (
                    <button type="submit" disabled={!canSend} className={primaryButtonClass}>
                        <IconSend size={14} className="inline mr-1 -mt-0.5" />
                        ส่ง
                    </button>
                )}
            </form>
        </div>
    );
}
