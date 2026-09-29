import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
    IconAdjustmentsHorizontal,
    IconArrowLeft,
    IconInfoCircle,
    IconMessage,
    IconRobot,
    IconUserCircle,
} from "@tabler/icons-react";
import { AppLayout } from "@/comps/layouts/AppLayout";
import { useNotification } from "@/comps/noti/notiComp";
import { createAgent } from "@/utils/api/agents";
import { getModels } from "@/utils/api/models";
import { LlmModelOut } from "@/utils/interface/agent.types";
import { ghostButtonClass, inputClass, labelClass, noteClass, primaryButtonClass, sectionClass } from "@/comps/agents/formStyles";
import { paramNotes } from "@/comps/agents/paramNotes";
import { AutoGrowTextarea } from "@/comps/agents/AutoGrowTextarea";
import { getErrorMessage } from "@/utils/errorMessage";
import { useCurrentUser } from "@/utils/authToken";

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

function NewAgentPageContent() {
    const router = useRouter();
    const { showNotification } = useNotification();
    const currentUser = useCurrentUser();

    const [models, setModels] = useState<LlmModelOut[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const [slug, setSlug] = useState("");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [modelId, setModelId] = useState("");
    const [systemPrompt, setSystemPrompt] = useState("");
    const [temperature, setTemperature] = useState("0.7");
    const [maxTokens, setMaxTokens] = useState("");
    const [topP, setTopP] = useState("");

    useEffect(() => {
        getModels()
            .then((modelsRes) => {
                setModels(modelsRes);
                if (modelsRes.length > 0) setModelId(modelsRes[0].id);
            })
            .catch((err) => showNotification("โหลดข้อมูลไม่สำเร็จ", getErrorMessage(err), "error"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!slug.trim() || !name.trim() || !currentUser) {
            showNotification("กรอกข้อมูลไม่ครบ", "กรุณากรอก slug และชื่อ Agent", "error");
            return;
        }

        setSubmitting(true);
        try {
            const agent = await createAgent({
                slug: slug.trim(),
                name: name.trim(),
                description: description.trim() || undefined,
                owner_id: currentUser.id,
                model_id: modelId || undefined,
                system_prompt: systemPrompt.trim() || undefined,
                config: {
                    temperature: temperature ? Number(temperature) : undefined,
                    max_tokens: maxTokens ? Number(maxTokens) : undefined,
                    top_p: topP ? Number(topP) : undefined,
                },
            });
            showNotification("สร้างสำเร็จ", `สร้าง Agent "${agent.name}" แล้ว`, "success");
            router.push(`/agents/${agent.id}`);
        } catch (err) {
            showNotification("สร้างไม่สำเร็จ", getErrorMessage(err), "error");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-screen w-full">
            <div className="h-16 flex items-center gap-3 px-6 border-b border-[#1f2733] shrink-0">
                <Link
                    href="/agents"
                    className="p-1.5 -ml-1.5 rounded-lg text-[#7b8698] hover:text-[#e6edf3] hover:bg-[#151b26] transition-colors"
                >
                    <IconArrowLeft size={18} />
                </Link>
                <span className="text-[#e6edf3] font-semibold">สร้าง Agent ใหม่</span>
            </div>

            <div className="flex-1 overflow-y-auto">
                <form
                    onSubmit={handleSubmit}
                    className="max-w-6xl mx-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6"
                >
                    <div className="lg:col-span-3 flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[#12251c] flex items-center justify-center shrink-0">
                            <IconRobot size={22} className="text-[#34d399]" stroke={1.8} />
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold text-[#e6edf3]">สร้าง Agent ใหม่</h1>
                            <p className="text-sm text-[#7b8698]">
                                กำหนดตัวตน โมเดล และ system prompt เริ่มต้นให้ agent ของคุณ
                            </p>
                        </div>
                    </div>

                    <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
                        <div className={sectionClass}>
                            <SectionTitle icon={<IconInfoCircle size={18} stroke={1.8} />}>ข้อมูลพื้นฐาน</SectionTitle>

                            <div className="grid grid-cols-2 gap-4">
                                <label className={labelClass}>
                                    <span className="flex items-baseline gap-1.5">
                                        Slug * <FieldHint>ตัวระบุที่ใช้เรียกผ่าน API เช่น customer-support</FieldHint>
                                    </span>
                                    <input
                                        className={`${inputClass} font-mono`}
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        placeholder="customer-support"
                                        required
                                    />
                                </label>
                                <label className={labelClass}>
                                    ชื่อ Agent *
                                    <input
                                        className={inputClass}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Customer Support Bot"
                                        required
                                    />
                                </label>
                            </div>

                            <label className={labelClass}>
                                คำอธิบาย
                                <textarea
                                    className={inputClass}
                                    rows={2}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Agent นี้ใช้ทำอะไร..."
                                />
                            </label>

                            <div className="grid grid-cols-2 gap-4">
                                <label className={labelClass}>
                                    Owner
                                    <div className="flex items-center gap-2 bg-[#0a0e14] border border-[#1f2733] rounded-lg px-3 py-2">
                                        <IconUserCircle size={18} className="text-[#7b8698]" stroke={1.8} />
                                        <span className="text-sm text-[#e6edf3]">
                                            {currentUser?.username ?? "กำลังโหลด..."}
                                        </span>
                                        <span className="text-[11px] text-[#5b6472] ml-auto">คุณ</span>
                                    </div>
                                </label>
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
                            </div>
                        </div>

                        <div className={sectionClass}>
                            <SectionTitle icon={<IconMessage size={18} stroke={1.8} />}>System Prompt เริ่มต้น</SectionTitle>
                            <label className={labelClass}>
                                เวอร์ชัน 1
                                <AutoGrowTextarea
                                    className={`${inputClass} font-mono`}
                                    rows={10}
                                    value={systemPrompt}
                                    onChange={(e) => setSystemPrompt(e.target.value)}
                                    placeholder="คุณคือผู้ช่วยที่..."
                                />
                            </label>
                        </div>
                    </div>

                    <div className={`${sectionClass} self-start`}>
                        <SectionTitle icon={<IconAdjustmentsHorizontal size={18} stroke={1.8} />}>
                            พารามิเตอร์การ Generate
                        </SectionTitle>

                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
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
                                <span className="flex items-baseline gap-1.5">
                                    Max Tokens <FieldHint>ความยาวคำตอบสูงสุด</FieldHint>
                                </span>
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
                                <span className="flex items-baseline gap-1.5">
                                    Top P <FieldHint>ความหลากหลายของคำ</FieldHint>
                                </span>
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
                        </div>
                        <p className="text-xs text-[#7b8698]">
                            ตั้งค่าเพิ่มเติม (top_k, context_window, repetition_penalty, seed) แก้ไขได้ในหน้ารายละเอียด Agent หลังสร้างเสร็จ
                        </p>
                    </div>

                    <div className="lg:col-span-3 flex justify-end gap-3">
                        <Link href="/agents" className={ghostButtonClass}>
                            ยกเลิก
                        </Link>
                        <button type="submit" disabled={submitting || !currentUser} className={primaryButtonClass}>
                            {submitting ? "กำลังสร้าง..." : "สร้าง Agent"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function NewAgentPage() {
    return (
        <>
            <Head>
                <title>สร้าง Agent · DALL-M</title>
            </Head>
            <AppLayout>
                <NewAgentPageContent />
            </AppLayout>
        </>
    );
}
