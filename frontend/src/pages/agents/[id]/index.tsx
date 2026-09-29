import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
    IconAdjustmentsHorizontal,
    IconArrowLeft,
    IconCheck,
    IconCopy,
    IconInfoCircle,
    IconMessage,
    IconPencil,
    IconPlus,
    IconRobot,
    IconTerminal2,
    IconTrash,
    IconUserCircle,
    IconX,
} from "@tabler/icons-react";
import { AppLayout } from "@/comps/layouts/AppLayout";
import { useNotification } from "@/comps/noti/notiComp";
import {
    activateAgentPrompt,
    createAgentPrompt,
    deleteAgent,
    deleteAgentPrompt,
    getAgent,
    getAgentConfig,
    getAgentPrompts,
    updateAgent,
    updateAgentPrompt,
    upsertAgentConfig,
} from "@/utils/api/agents";
import { getModels } from "@/utils/api/models";
import { getUsers } from "@/utils/api/users";
import { AgentConfigOut, AgentOut, AgentPromptOut, LlmModelOut, UserOut } from "@/utils/interface/agent.types";
import {
    dangerButtonClass,
    ghostButtonClass,
    inputClass,
    labelClass,
    noteClass,
    primaryButtonClass,
    sectionClass,
} from "@/comps/agents/formStyles";
import { paramNotes } from "@/comps/agents/paramNotes";
import { AutoGrowTextarea } from "@/comps/agents/AutoGrowTextarea";
import { AgentInvokePanel } from "@/comps/agents/AgentInvokePanel";
import { getErrorMessage } from "@/utils/errorMessage";

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-[#34d399]">{icon}</span>
            <h2 className="text-sm font-semibold text-[#e6edf3]">{children}</h2>
        </div>
    );
}

function FieldHint({ children }: { children: React.ReactNode }) {
    return <span className="text-[11px] text-[#5b6472] font-normal">{children}</span>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
            <span
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                    checked ? "bg-[#34d399]" : "bg-[#1f2733]"
                }`}
            >
                <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[#0a0e14] transition-transform duration-200 ${
                        checked ? "translate-x-[18px]" : "translate-x-1"
                    }`}
                />
            </span>
            <span className="text-sm text-[#a3aebc]">{label}</span>
        </label>
    );
}

function OverviewRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0 border-b border-[#1f2733] last:border-0">
            <span className="text-xs text-[#7b8698] shrink-0">{label}</span>
            <span className="text-sm text-[#e6edf3] text-right min-w-0 truncate">{children}</span>
        </div>
    );
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
    } catch {
        return iso;
    }
}

function AgentDetailContent({ agentId }: { agentId: string }) {
    const router = useRouter();
    const { showNotification } = useNotification();

    const [agent, setAgent] = useState<AgentOut | null>(null);
    const [prompts, setPrompts] = useState<AgentPromptOut[]>([]);
    const [models, setModels] = useState<LlmModelOut[]>([]);
    const [users, setUsers] = useState<UserOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [idCopied, setIdCopied] = useState(false);

    // Info form state
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [description, setDescription] = useState("");
    const [modelId, setModelId] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [savingInfo, setSavingInfo] = useState(false);

    // New prompt form state
    const [newPrompt, setNewPrompt] = useState("");
    const [newPromptActive, setNewPromptActive] = useState(true);
    const [savingPrompt, setSavingPrompt] = useState(false);

    // Prompt edit-in-place state
    const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState("");
    const [savingEdit, setSavingEdit] = useState(false);

    // Config form state
    const [temperature, setTemperature] = useState("");
    const [maxTokens, setMaxTokens] = useState("");
    const [topP, setTopP] = useState("");
    const [topK, setTopK] = useState("");
    const [contextWindow, setContextWindow] = useState("");
    const [repetitionPenalty, setRepetitionPenalty] = useState("");
    const [seed, setSeed] = useState("");
    const [streamingEnabled, setStreamingEnabled] = useState(true);
    const [savingConfig, setSavingConfig] = useState(false);

    const applyAgent = (a: AgentOut) => {
        setAgent(a);
        setName(a.name);
        setSlug(a.slug);
        setDescription(a.description ?? "");
        setModelId(a.model_id ?? "");
        setIsActive(a.is_active);
    };

    const applyConfig = (c: AgentConfigOut | null) => {
        setTemperature(c?.temperature != null ? String(c.temperature) : "0.7");
        setMaxTokens(c?.max_tokens != null ? String(c.max_tokens) : "");
        setTopP(c?.top_p != null ? String(c.top_p) : "");
        setTopK(c?.top_k != null ? String(c.top_k) : "");
        setContextWindow(c?.context_window != null ? String(c.context_window) : "");
        setRepetitionPenalty(c?.repetition_penalty != null ? String(c.repetition_penalty) : "");
        setSeed(c?.seed != null ? String(c.seed) : "");
        setStreamingEnabled(c?.streaming_enabled ?? true);
    };

    const load = () => {
        Promise.all([
            getAgent(agentId),
            getAgentPrompts(agentId),
            getModels(),
            getUsers(),
            getAgentConfig(agentId).catch(() => null),
        ])
            .then(([agentRes, promptsRes, modelsRes, usersRes, configRes]) => {
                applyAgent(agentRes);
                setPrompts(promptsRes);
                setModels(modelsRes);
                setUsers(usersRes);
                applyConfig(configRes);
            })
            .catch((err) => showNotification("โหลดข้อมูลไม่สำเร็จ", getErrorMessage(err), "error"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agentId]);

    const handleSaveInfo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agent) return;
        setSavingInfo(true);
        try {
            const updated = await updateAgent(agent.id, {
                name: name.trim(),
                slug: slug.trim(),
                description: description.trim() || undefined,
                model_id: modelId || undefined,
                is_active: isActive,
            });
            applyAgent(updated);
            showNotification("บันทึกสำเร็จ", "อัปเดตข้อมูล Agent แล้ว", "success");
        } catch (err) {
            showNotification("บันทึกไม่สำเร็จ", getErrorMessage(err), "error");
        } finally {
            setSavingInfo(false);
        }
    };

    const handleDeleteAgent = async () => {
        if (!agent) return;
        if (!window.confirm(`ลบ Agent "${agent.name}" ใช่หรือไม่? การกระทำนี้ย้อนกลับไม่ได้`)) return;
        try {
            await deleteAgent(agent.id);
            showNotification("ลบสำเร็จ", "ลบ Agent แล้ว", "success");
            router.push("/agents");
        } catch (err) {
            showNotification("ลบไม่สำเร็จ", getErrorMessage(err), "error");
        }
    };

    const handleAddPrompt = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agent || !newPrompt.trim()) return;
        setSavingPrompt(true);
        try {
            await createAgentPrompt(agent.id, { system_prompt: newPrompt.trim(), is_active: newPromptActive });
            setNewPrompt("");
            setNewPromptActive(true);
            const updatedPrompts = await getAgentPrompts(agent.id);
            setPrompts(updatedPrompts);
            showNotification("เพิ่มสำเร็จ", "เพิ่ม prompt เวอร์ชันใหม่แล้ว", "success");
        } catch (err) {
            showNotification("เพิ่มไม่สำเร็จ", getErrorMessage(err), "error");
        } finally {
            setSavingPrompt(false);
        }
    };

    const handleActivatePrompt = async (promptId: string) => {
        if (!agent) return;
        try {
            await activateAgentPrompt(agent.id, promptId);
            const updatedPrompts = await getAgentPrompts(agent.id);
            setPrompts(updatedPrompts);
            showNotification("สำเร็จ", "ตั้ง prompt เวอร์ชันนี้เป็น active แล้ว", "success");
        } catch (err) {
            showNotification("ไม่สำเร็จ", getErrorMessage(err), "error");
        }
    };

    const handleStartEditPrompt = (prompt: AgentPromptOut) => {
        setEditingPromptId(prompt.id);
        setEditingText(prompt.system_prompt);
    };

    const handleCancelEditPrompt = () => {
        setEditingPromptId(null);
        setEditingText("");
    };

    const handleSaveEditPrompt = async (promptId: string) => {
        if (!agent || !editingText.trim()) return;
        setSavingEdit(true);
        try {
            const updated = await updateAgentPrompt(agent.id, promptId, { system_prompt: editingText.trim() });
            setPrompts((prev) => prev.map((p) => (p.id === promptId ? updated : p)));
            setEditingPromptId(null);
            setEditingText("");
            showNotification("บันทึกสำเร็จ", "แก้ไข prompt เวอร์ชันนี้แล้ว", "success");
        } catch (err) {
            showNotification("บันทึกไม่สำเร็จ", getErrorMessage(err), "error");
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDeletePrompt = async (promptId: string) => {
        if (!agent) return;
        if (!window.confirm("ลบ prompt เวอร์ชันนี้ใช่หรือไม่?")) return;
        try {
            await deleteAgentPrompt(agent.id, promptId);
            setPrompts((prev) => prev.filter((p) => p.id !== promptId));
        } catch (err) {
            showNotification("ลบไม่สำเร็จ", getErrorMessage(err), "error");
        }
    };

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agent) return;
        setSavingConfig(true);
        try {
            const updated = await upsertAgentConfig(agent.id, {
                temperature: temperature ? Number(temperature) : undefined,
                max_tokens: maxTokens ? Number(maxTokens) : undefined,
                top_p: topP ? Number(topP) : undefined,
                top_k: topK ? Number(topK) : undefined,
                context_window: contextWindow ? Number(contextWindow) : undefined,
                repetition_penalty: repetitionPenalty ? Number(repetitionPenalty) : undefined,
                seed: seed ? Number(seed) : undefined,
                streaming_enabled: streamingEnabled,
            });
            applyConfig(updated);
            showNotification("บันทึกสำเร็จ", "อัปเดต config แล้ว", "success");
        } catch (err) {
            showNotification("บันทึกไม่สำเร็จ", getErrorMessage(err), "error");
        } finally {
            setSavingConfig(false);
        }
    };

    const handleCopyId = async () => {
        if (!agent) return;
        try {
            await navigator.clipboard.writeText(agent.id);
            setIdCopied(true);
            setTimeout(() => setIdCopied(false), 2000);
        } catch {
            // clipboard unavailable, ignore
        }
    };

    if (loading || !agent) {
        return (
            <div className="flex flex-col h-screen w-full items-center justify-center text-[#7b8698] text-sm">
                กำลังโหลด...
            </div>
        );
    }

    const activePrompt = prompts.find((p) => p.is_active) ?? null;
    const currentModel = models.find((m) => m.id === agent.model_id) ?? null;
    const ownerName = users.find((u) => u.id === agent.owner_id)?.username ?? agent.owner_id;

    return (
        <div className="flex flex-col h-screen w-full">
            <div className="h-16 flex items-center justify-between px-6 border-b border-[#1f2733] shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <Link
                        href="/agents"
                        className="p-1.5 -ml-1.5 rounded-lg text-[#7b8698] hover:text-[#e6edf3] hover:bg-[#151b26] transition-colors shrink-0"
                    >
                        <IconArrowLeft size={18} />
                    </Link>
                    <div className="w-9 h-9 rounded-xl bg-[#12251c] flex items-center justify-center shrink-0">
                        <IconRobot size={18} className="text-[#34d399]" stroke={1.8} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[#e6edf3] font-semibold truncate">{agent.name}</span>
                            <span
                                className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${
                                    agent.is_active ? "bg-[#12251c] text-[#34d399]" : "bg-[#1f2733] text-[#7b8698]"
                                }`}
                            >
                                {agent.is_active ? "active" : "inactive"}
                            </span>
                        </div>
                        <div className="text-xs text-[#7b8698] font-mono truncate">{agent.slug}</div>
                    </div>
                </div>
                <button onClick={handleDeleteAgent} className={`${dangerButtonClass} shrink-0`}>
                    <IconTrash size={14} className="inline mr-1 -mt-0.5" />
                    ลบ Agent
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-6xl mx-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
                        <form onSubmit={handleSaveInfo} className={sectionClass}>
                            <SectionTitle icon={<IconInfoCircle size={18} stroke={1.8} />}>ข้อมูล Agent</SectionTitle>
                            <div className="grid grid-cols-2 gap-4">
                                <label className={labelClass}>
                                    Slug
                                    <input
                                        className={`${inputClass} font-mono`}
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        required
                                    />
                                </label>
                                <label className={labelClass}>
                                    ชื่อ Agent
                                    <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
                                </label>
                            </div>
                            <label className={labelClass}>
                                คำอธิบาย
                                <textarea
                                    className={inputClass}
                                    rows={2}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-4">
                                <label className={labelClass}>
                                    Model
                                    <select className={inputClass} value={modelId} onChange={(e) => setModelId(e.target.value)}>
                                        <option value="">ไม่ระบุ</option>
                                        {models.map((m) => (
                                            <option key={m.id} value={m.id}>
                                                {m.name === m.model_name ? m.name : `${m.name} (${m.model_name})`}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className={labelClass}>
                                    Owner
                                    <div className="flex items-center gap-2 bg-[#0a0e14] border border-[#1f2733] rounded-lg px-3 py-2 opacity-70">
                                        <IconUserCircle size={16} className="text-[#7b8698]" stroke={1.8} />
                                        <span className="text-sm text-[#e6edf3] truncate">{ownerName}</span>
                                    </div>
                                </label>
                            </div>
                            <Toggle checked={isActive} onChange={setIsActive} label="เปิดใช้งาน Agent นี้" />
                            <div className="flex justify-end">
                                <button type="submit" disabled={savingInfo} className={primaryButtonClass}>
                                    {savingInfo ? "กำลังบันทึก..." : "บันทึก"}
                                </button>
                            </div>
                        </form>

                        <div className={sectionClass}>
                            <SectionTitle icon={<IconMessage size={18} stroke={1.8} />}>System Prompts</SectionTitle>
                            <div className="flex flex-col gap-2">
                                {prompts.length === 0 && <p className="text-xs text-[#7b8698]">ยังไม่มี prompt</p>}
                                {prompts.map((p) => {
                                    const isEditing = editingPromptId === p.id;
                                    return (
                                        <div
                                            key={p.id}
                                            className={`flex items-start gap-3 rounded-xl p-3 border ${
                                                p.is_active ? "border-[#255e42] bg-[#0d1a13]" : "border-[#1f2733]"
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-mono text-[#a3aebc]">v{p.version}</span>
                                                    {p.is_active && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#12251c] text-[#34d399]">active</span>
                                                    )}
                                                </div>
                                                {isEditing ? (
                                                    <div className="flex flex-col gap-2">
                                                        <AutoGrowTextarea
                                                            className={`${inputClass} font-mono`}
                                                            rows={4}
                                                            value={editingText}
                                                            onChange={(e) => setEditingText(e.target.value)}
                                                            autoFocus
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSaveEditPrompt(p.id)}
                                                                disabled={savingEdit || !editingText.trim()}
                                                                className={primaryButtonClass}
                                                            >
                                                                <IconCheck size={12} className="inline mr-1 -mt-0.5" />
                                                                {savingEdit ? "กำลังบันทึก..." : "บันทึก"}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={handleCancelEditPrompt}
                                                                disabled={savingEdit}
                                                                className={ghostButtonClass}
                                                            >
                                                                <IconX size={12} className="inline mr-1 -mt-0.5" />
                                                                ยกเลิก
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-[#e6edf3] whitespace-pre-wrap line-clamp-3">{p.system_prompt}</p>
                                                )}
                                            </div>
                                            {!isEditing && (
                                                <div className="flex flex-col gap-1.5 shrink-0">
                                                    <button onClick={() => handleStartEditPrompt(p)} className={ghostButtonClass}>
                                                        <IconPencil size={12} className="inline mr-1 -mt-0.5" />
                                                        แก้ไข
                                                    </button>
                                                    {!p.is_active && (
                                                        <button onClick={() => handleActivatePrompt(p.id)} className={ghostButtonClass}>
                                                            <IconCheck size={12} className="inline mr-1 -mt-0.5" />
                                                            ตั้ง active
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleDeletePrompt(p.id)} className={dangerButtonClass}>
                                                        ลบ
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <form onSubmit={handleAddPrompt} className="flex flex-col gap-2 pt-2 border-t border-[#1f2733]">
                                <label className={labelClass}>
                                    เพิ่ม prompt เวอร์ชันใหม่
                                    <AutoGrowTextarea
                                        className={`${inputClass} font-mono`}
                                        rows={3}
                                        value={newPrompt}
                                        onChange={(e) => setNewPrompt(e.target.value)}
                                        placeholder="คุณคือผู้ช่วยที่..."
                                    />
                                </label>
                                <div className="flex items-center justify-between">
                                    <Toggle checked={newPromptActive} onChange={setNewPromptActive} label="ตั้งเป็น active ทันที" />
                                    <button type="submit" disabled={savingPrompt || !newPrompt.trim()} className={primaryButtonClass}>
                                        <IconPlus size={14} className="inline mr-1 -mt-0.5" />
                                        {savingPrompt ? "กำลังเพิ่ม..." : "เพิ่มเวอร์ชัน"}
                                    </button>
                                </div>
                            </form>
                        </div>

                        <form onSubmit={handleSaveConfig} className={sectionClass}>
                            <SectionTitle icon={<IconAdjustmentsHorizontal size={18} stroke={1.8} />}>Generation Config</SectionTitle>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                <label className={labelClass}>
                                    <span className="flex items-baseline gap-1.5">
                                        Temperature <FieldHint>ยิ่งสูงยิ่งสุ่ม</FieldHint>
                                    </span>
                                    <input
                                        className={inputClass}
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="2"
                                        value={temperature}
                                        onChange={(e) => setTemperature(e.target.value)}
                                    />
                                    <span className={noteClass}>{paramNotes.temperature}</span>
                                </label>
                                <label className={labelClass}>
                                    Max Tokens
                                    <input
                                        className={inputClass}
                                        type="number"
                                        min="1"
                                        placeholder="ไม่จำกัด"
                                        value={maxTokens}
                                        onChange={(e) => setMaxTokens(e.target.value)}
                                    />
                                    <span className={noteClass}>{paramNotes.max_tokens}</span>
                                </label>
                                <label className={labelClass}>
                                    Top P
                                    <input
                                        className={inputClass}
                                        type="number"
                                        step="0.05"
                                        min="0"
                                        max="1"
                                        placeholder="ค่า default"
                                        value={topP}
                                        onChange={(e) => setTopP(e.target.value)}
                                    />
                                    <span className={noteClass}>{paramNotes.top_p}</span>
                                </label>
                                <label className={labelClass}>
                                    Top K
                                    <input
                                        className={inputClass}
                                        type="number"
                                        min="0"
                                        placeholder="ค่า default"
                                        value={topK}
                                        onChange={(e) => setTopK(e.target.value)}
                                    />
                                    <span className={noteClass}>{paramNotes.top_k}</span>
                                </label>
                                <label className={labelClass}>
                                    Context Window
                                    <input
                                        className={inputClass}
                                        type="number"
                                        min="0"
                                        value={contextWindow}
                                        onChange={(e) => setContextWindow(e.target.value)}
                                    />
                                    <span className={noteClass}>{paramNotes.context_window}</span>
                                </label>
                                <label className={labelClass}>
                                    Repetition Penalty
                                    <input
                                        className={inputClass}
                                        type="number"
                                        step="0.05"
                                        placeholder="ค่า default"
                                        value={repetitionPenalty}
                                        onChange={(e) => setRepetitionPenalty(e.target.value)}
                                    />
                                    <span className={noteClass}>{paramNotes.repetition_penalty}</span>
                                </label>
                                <label className={labelClass}>
                                    Seed
                                    <input
                                        className={inputClass}
                                        type="number"
                                        placeholder="สุ่มทุกครั้ง"
                                        value={seed}
                                        onChange={(e) => setSeed(e.target.value)}
                                    />
                                    <span className={noteClass}>{paramNotes.seed}</span>
                                </label>
                            </div>
                            <Toggle checked={streamingEnabled} onChange={setStreamingEnabled} label="เปิดใช้งาน streaming" />
                            <div className="flex justify-end">
                                <button type="submit" disabled={savingConfig} className={primaryButtonClass}>
                                    {savingConfig ? "กำลังบันทึก..." : "บันทึก Config"}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="order-first lg:order-none flex flex-col gap-6 min-w-0">
                        <div className={sectionClass}>
                            <SectionTitle icon={<IconInfoCircle size={18} stroke={1.8} />}>ภาพรวม</SectionTitle>
                            <div className="flex flex-col">
                                <OverviewRow label="สถานะ">
                                    <span
                                        className={`text-xs px-2 py-0.5 rounded-full ${
                                            agent.is_active ? "bg-[#12251c] text-[#34d399]" : "bg-[#1f2733] text-[#7b8698]"
                                        }`}
                                    >
                                        {agent.is_active ? "active" : "inactive"}
                                    </span>
                                </OverviewRow>
                                <OverviewRow label="Owner">{ownerName}</OverviewRow>
                                <OverviewRow label="Model">{currentModel?.name ?? "ไม่ระบุ"}</OverviewRow>
                                <OverviewRow label="เวอร์ชัน Prompt">{prompts.length}</OverviewRow>
                                <OverviewRow label="สร้างเมื่อ">{formatDate(agent.created_at)}</OverviewRow>
                                <OverviewRow label="แก้ไขล่าสุด">{formatDate(agent.updated_at)}</OverviewRow>
                            </div>
                            <button
                                type="button"
                                onClick={handleCopyId}
                                className="flex items-center justify-between gap-2 bg-[#0a0e14] border border-[#1f2733] rounded-lg px-3 py-2 text-left hover:border-[#2a3441] transition-colors"
                            >
                                <span className="text-xs font-mono text-[#7b8698] truncate">{agent.id}</span>
                                {idCopied ? (
                                    <IconCheck size={14} className="text-[#34d399] shrink-0" />
                                ) : (
                                    <IconCopy size={14} className="text-[#7b8698] shrink-0" />
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="lg:col-span-3">
                        <div className={sectionClass}>
                            <SectionTitle icon={<IconTerminal2 size={18} stroke={1.8} />}>เรียกใช้ / ทดสอบ Agent นี้</SectionTitle>
                            <AgentInvokePanel agent={agent} activePrompt={activePrompt} prompts={prompts} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AgentDetailPage() {
    const router = useRouter();
    const { id } = router.query;

    if (!router.isReady || typeof id !== "string") {
        return null;
    }

    return (
        <>
            <Head>
                <title>รายละเอียด Agent · DALL-M</title>
            </Head>
            <AppLayout>
                <AgentDetailContent agentId={id} />
            </AppLayout>
        </>
    );
}
