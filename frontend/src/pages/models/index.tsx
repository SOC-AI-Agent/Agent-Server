import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { IconCheck, IconCpu, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { AppLayout } from "@/comps/layouts/AppLayout";
import { useNotification } from "@/comps/noti/notiComp";
import { ghostButtonClass, inputClass, labelClass, primaryButtonClass, sectionClass } from "@/comps/agents/formStyles";
import { deleteModel, getModels, updateModel, upsertModel } from "@/utils/api/models";
import { LlmModelOut } from "@/utils/interface/agent.types";
import { getErrorMessage } from "@/utils/errorMessage";
import { useCurrentUser } from "@/utils/authToken";

function ModelsPageContent() {
    const router = useRouter();
    const currentUser = useCurrentUser();
    const { showNotification } = useNotification();

    const [models, setModels] = useState<LlmModelOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [guardChecked, setGuardChecked] = useState(false);

    // Add form
    const [showAdd, setShowAdd] = useState(false);
    const [newModelName, setNewModelName] = useState("");
    const [newDisplayName, setNewDisplayName] = useState("");
    const [newProvider, setNewProvider] = useState("openrouter");
    const [newActive, setNewActive] = useState(true);
    const [savingNew, setSavingNew] = useState(false);

    // Inline edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editModelName, setEditModelName] = useState("");
    const [editDisplayName, setEditDisplayName] = useState("");
    const [editProvider, setEditProvider] = useState("");
    const [editActive, setEditActive] = useState(true);
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => {
        if (currentUser === null) return;
        if (!currentUser.is_admin) {
            router.replace("/agents");
            return;
        }
        setGuardChecked(true);
    }, [currentUser, router]);

    const load = () => {
        getModels()
            .then(setModels)
            .catch((err) => showNotification("โหลดข้อมูลไม่สำเร็จ", getErrorMessage(err), "error"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (guardChecked) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guardChecked]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const modelId = newModelName.trim();
        if (!modelId) {
            showNotification("กรอกข้อมูลไม่ครบ", "กรุณากรอก Model ID เช่น google/gemini-2.5-flash-lite", "error");
            return;
        }
        setSavingNew(true);
        try {
            await upsertModel({
                model_name: modelId,
                name: newDisplayName.trim() || modelId,
                provider: newProvider.trim() || "openrouter",
                is_active: newActive,
            });
            showNotification("บันทึกสำเร็จ", `เพิ่ม Model "${modelId}" แล้ว`, "success");
            setNewModelName("");
            setNewDisplayName("");
            setNewProvider("openrouter");
            setNewActive(true);
            setShowAdd(false);
            load();
        } catch (err) {
            showNotification("เพิ่มไม่สำเร็จ", getErrorMessage(err), "error");
        } finally {
            setSavingNew(false);
        }
    };

    const startEdit = (m: LlmModelOut) => {
        setEditingId(m.id);
        setEditModelName(m.model_name);
        setEditDisplayName(m.name);
        setEditProvider(m.provider || "openrouter");
        setEditActive(m.is_active);
    };

    const cancelEdit = () => {
        setEditingId(null);
    };

    const handleSaveEdit = async (modelId: string) => {
        const cleanModelName = editModelName.trim();
        if (!cleanModelName) {
            showNotification("กรอกข้อมูลไม่ครบ", "Model ID ห้ามว่าง", "error");
            return;
        }
        setSavingEdit(true);
        try {
            await updateModel(modelId, {
                model_name: cleanModelName,
                name: editDisplayName.trim() || cleanModelName,
                provider: editProvider.trim() || "openrouter",
                is_active: editActive,
            });
            showNotification("บันทึกสำเร็จ", `อัปเดต "${cleanModelName}" แล้ว`, "success");
            setEditingId(null);
            load();
        } catch (err) {
            showNotification("แก้ไขไม่สำเร็จ", getErrorMessage(err), "error");
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDelete = async (m: LlmModelOut) => {
        if (!window.confirm(`ลบ Model "${m.model_name}" ใช่หรือไม่? (Agent ที่เลือก Model นี้อยู่จะถูกตั้งเป็น "ไม่ระบุ")`)) {
            return;
        }
        try {
            await deleteModel(m.id);
            showNotification("ลบสำเร็จ", `ลบ Model "${m.model_name}" แล้ว`, "success");
            if (editingId === m.id) setEditingId(null);
            load();
        } catch (err) {
            showNotification("ลบไม่สำเร็จ", getErrorMessage(err), "error");
        }
    };

    if (!guardChecked) return null;

    return (
        <div className="flex flex-col h-screen w-full">
            <div className="h-16 flex items-center justify-between px-6 border-b border-[#1f2733] shrink-0">
                <div className="flex items-center gap-2">
                    <IconCpu size={20} className="text-[#34d399]" />
                    <span className="text-[#e6edf3] font-semibold">Models</span>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAdd((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#12251c] text-[#34d399] text-sm font-medium hover:bg-[#16311f] transition-colors cursor-pointer"
                >
                    <IconPlus size={16} />
                    เพิ่ม Model
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                {showAdd && (
                    <form onSubmit={handleAdd} className={sectionClass}>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-[#e6edf3]">เพิ่ม Model ใหม่</span>
                            <button
                                type="button"
                                onClick={() => setShowAdd(false)}
                                className="text-[#7b8698] hover:text-[#e6edf3] cursor-pointer"
                                title="ปิด"
                            >
                                <IconX size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <label className={labelClass}>
                                Model ID (ใช้ส่งเข้า API) *
                                <input
                                    className={`${inputClass} font-mono`}
                                    value={newModelName}
                                    onChange={(e) => setNewModelName(e.target.value)}
                                    placeholder="เช่น deepseek/deepseek-chat-v3-0324:free"
                                    required
                                />
                            </label>
                            <label className={labelClass}>
                                ชื่อที่แสดง (ไม่กรอกจะใช้ Model ID)
                                <input
                                    className={inputClass}
                                    value={newDisplayName}
                                    onChange={(e) => setNewDisplayName(e.target.value)}
                                    placeholder="DeepSeek V3 Free"
                                />
                            </label>
                            <label className={labelClass}>
                                Provider
                                <input
                                    className={inputClass}
                                    value={newProvider}
                                    onChange={(e) => setNewProvider(e.target.value)}
                                    placeholder="openrouter"
                                />
                            </label>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <label className="flex items-center gap-2 text-sm text-[#a3aebc] cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={newActive}
                                    onChange={(e) => setNewActive(e.target.checked)}
                                    className="accent-[#34d399]"
                                />
                                Active (แสดงในตัวเลือกของ Agent)
                            </label>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => setShowAdd(false)} className={ghostButtonClass}>
                                    ยกเลิก
                                </button>
                                <button type="submit" disabled={savingNew} className={primaryButtonClass}>
                                    {savingNew ? "กำลังบันทึก..." : "บันทึก Model"}
                                </button>
                            </div>
                        </div>
                    </form>
                )}

                {loading && <div className="text-[#7b8698] text-sm">กำลังโหลด...</div>}

                {!loading && models.length === 0 && (
                    <div className="text-[#7b8698] text-sm">ยังไม่มี Model ในระบบ กด &quot;เพิ่ม Model&quot; ด้านบนเพื่อเพิ่มจาก OpenRouter</div>
                )}

                {!loading && models.length > 0 && (
                    <div className="overflow-x-auto border border-[#1f2733] rounded-2xl">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[#7b8698] border-b border-[#1f2733]">
                                    <th className="px-4 py-3 font-medium">Model ID</th>
                                    <th className="px-4 py-3 font-medium">ชื่อที่แสดง</th>
                                    <th className="px-4 py-3 font-medium">Provider</th>
                                    <th className="px-4 py-3 font-medium">สถานะ</th>
                                    <th className="px-4 py-3 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {models.map((m) => {
                                    const isEditing = editingId === m.id;
                                    return (
                                        <tr key={m.id} className="border-b border-[#1f2733] last:border-0 hover:bg-[#0d1219]">
                                            <td className="px-4 py-3 text-[#e6edf3] font-mono text-xs">
                                                {isEditing ? (
                                                    <input
                                                        className={`${inputClass} font-mono text-xs py-1.5`}
                                                        value={editModelName}
                                                        onChange={(e) => setEditModelName(e.target.value)}
                                                    />
                                                ) : (
                                                    m.model_name
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-[#a3aebc]">
                                                {isEditing ? (
                                                    <input
                                                        className={`${inputClass} text-xs py-1.5`}
                                                        value={editDisplayName}
                                                        onChange={(e) => setEditDisplayName(e.target.value)}
                                                    />
                                                ) : (
                                                    m.name
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-[#a3aebc]">
                                                {isEditing ? (
                                                    <input
                                                        className={`${inputClass} text-xs py-1.5`}
                                                        value={editProvider}
                                                        onChange={(e) => setEditProvider(e.target.value)}
                                                    />
                                                ) : (
                                                    m.provider || "-"
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {isEditing ? (
                                                    <label className="flex items-center gap-2 text-xs text-[#a3aebc] cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={editActive}
                                                            onChange={(e) => setEditActive(e.target.checked)}
                                                            className="accent-[#34d399]"
                                                        />
                                                        Active
                                                    </label>
                                                ) : (
                                                    <span
                                                        className={`text-xs px-2 py-1 rounded-full ${
                                                            m.is_active
                                                                ? "bg-[#12251c] text-[#34d399]"
                                                                : "bg-[#1f2733] text-[#7b8698]"
                                                        }`}
                                                    >
                                                        {m.is_active ? "Active" : "Inactive"}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="inline-flex items-center gap-1">
                                                    {isEditing ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                disabled={savingEdit}
                                                                onClick={() => handleSaveEdit(m.id)}
                                                                className="p-1.5 rounded-lg text-[#34d399] hover:bg-[#12251c] transition-colors cursor-pointer"
                                                                title="บันทึก"
                                                            >
                                                                <IconCheck size={16} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={cancelEdit}
                                                                className="p-1.5 rounded-lg text-[#7b8698] hover:text-[#e6edf3] hover:bg-[#151b26] transition-colors cursor-pointer"
                                                                title="ยกเลิก"
                                                            >
                                                                <IconX size={16} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => startEdit(m)}
                                                                className="p-1.5 rounded-lg text-[#7b8698] hover:text-[#e6edf3] hover:bg-[#151b26] transition-colors cursor-pointer"
                                                                title="แก้ไข"
                                                            >
                                                                <IconPencil size={16} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDelete(m)}
                                                                className="p-1.5 rounded-lg text-[#7b8698] hover:text-[#f87171] hover:bg-[#2a1414] transition-colors cursor-pointer"
                                                                title="ลบ"
                                                            >
                                                                <IconTrash size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ModelsPage() {
    return (
        <>
            <Head>
                <title>Models | DALL-M</title>
            </Head>
            <AppLayout>
                <ModelsPageContent />
            </AppLayout>
        </>
    );
}
