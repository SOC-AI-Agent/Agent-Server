import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconHistory, IconRefresh, IconX } from "@tabler/icons-react";
import { AppLayout } from "@/comps/layouts/AppLayout";
import { useNotification } from "@/comps/noti/notiComp";
import { getInferenceRequests } from "@/utils/api/history";
import { getAgents } from "@/utils/api/agents";
import { AgentOut, InferenceRequestOut } from "@/utils/interface/agent.types";
import { getErrorMessage } from "@/utils/errorMessage";
import { useCurrentUser } from "@/utils/authToken";
import { inputClass, labelClass, ghostButtonClass } from "@/comps/agents/formStyles";

const PAGE_SIZE = 25;

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "medium" });
    } catch {
        return iso;
    }
}

function StatusBadge({ status: s }: { status: string }) {
    const ok = s === "success";
    return (
        <span
            className={`text-xs px-2 py-1 rounded-full ${ok ? "bg-[#12251c] text-[#34d399]" : "bg-[#2a1414] text-[#f87171]"}`}
        >
            {s}
        </span>
    );
}

function DetailModal({ item, onClose }: { item: InferenceRequestOut; onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-[#10151f] border border-[#1f2733] rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2733] shrink-0">
                    <div className="min-w-0">
                        <div className="text-[#e6edf3] font-semibold truncate">{item.agent_name}</div>
                        <div className="text-xs text-[#7b8698] font-mono">
                            {item.agent_slug} · v{item.prompt_version} · {formatDate(item.created_at)}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-[#7b8698] hover:text-[#e6edf3] hover:bg-[#151b26] shrink-0">
                        <IconX size={18} />
                    </button>
                </div>
                <div className="p-5 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#7b8698]">
                        <StatusBadge status={item.status} />
                        <span>Owner: {item.owner_username}</span>
                        {item.model_name && <span>· Model: {item.model_name}</span>}
                        {item.latency_ms != null && <span>· {item.latency_ms}ms</span>}
                        {item.total_tokens != null && <span>· {item.total_tokens} tokens</span>}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-[#a3aebc] font-medium">User Prompt</span>
                        <pre className="bg-[#0a0e14] border border-[#1f2733] rounded-xl p-3 text-sm text-[#e6edf3] whitespace-pre-wrap break-words">
                            {item.user_prompt}
                        </pre>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-[#a3aebc] font-medium">Assistant Response</span>
                        <pre className="bg-[#0a0e14] border border-[#1f2733] rounded-xl p-3 text-sm text-[#e6edf3] whitespace-pre-wrap break-words">
                            {item.assistant_response || "-"}
                        </pre>
                    </div>

                    {item.error_message && (
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs text-[#f87171] font-medium">Error</span>
                            <pre className="bg-[#2a1414]/40 border border-[#3a1a1a] rounded-xl p-3 text-sm text-[#f87171] whitespace-pre-wrap break-words">
                                {item.error_message}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function HistoryPageContent() {
    const currentUser = useCurrentUser();
    const { showNotification } = useNotification();

    const [items, setItems] = useState<InferenceRequestOut[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(true);

    const [agents, setAgents] = useState<AgentOut[]>([]);
    const [agentFilter, setAgentFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    const [selected, setSelected] = useState<InferenceRequestOut | null>(null);

    useEffect(() => {
        getAgents()
            .then((res) => {
                const visible = currentUser?.is_admin ? res : res.filter((a) => a.owner_id === currentUser?.id);
                setAgents(visible);
            })
            .catch(() => {
                // filter dropdown is a convenience only; ignore failures here
            });
    }, [currentUser]);

    const load = () => {
        getInferenceRequests({
            agent_id: agentFilter || undefined,
            status_filter: statusFilter || undefined,
            limit: PAGE_SIZE,
            offset,
        })
            .then((res) => {
                setItems(res.items);
                setTotal(res.total);
            })
            .catch((err) => showNotification("โหลดข้อมูลไม่สำเร็จ", getErrorMessage(err), "error"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agentFilter, statusFilter, offset]);

    const handleAgentFilterChange = (value: string) => {
        setAgentFilter(value);
        setOffset(0);
    };

    const handleStatusFilterChange = (value: string) => {
        setStatusFilter(value);
        setOffset(0);
    };

    const canPrev = offset > 0;
    const canNext = offset + PAGE_SIZE < total;

    return (
        <div className="flex flex-col h-screen w-full">
            <div className="h-16 flex items-center justify-between px-6 border-b border-[#1f2733] shrink-0">
                <div className="flex items-center gap-2">
                    <IconHistory size={20} className="text-[#34d399]" />
                    <span className="text-[#e6edf3] font-semibold">History</span>
                    <span className="text-xs text-[#5b6472]">
                        {currentUser?.is_admin ? "· ดูของทุกคน" : "· ดูเฉพาะ Agent ของคุณ"}
                    </span>
                </div>
                <button onClick={load} className={ghostButtonClass}>
                    <IconRefresh size={14} className="inline mr-1 -mt-0.5" />
                    รีเฟรช
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                <div className="flex flex-wrap items-end gap-3">
                    <label className={`${labelClass} min-w-[200px]`}>
                        Agent
                        <select className={inputClass} value={agentFilter} onChange={(e) => handleAgentFilterChange(e.target.value)}>
                            <option value="">ทั้งหมด</option>
                            {agents.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name} ({a.slug})
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className={`${labelClass} min-w-[150px]`}>
                        สถานะ
                        <select className={inputClass} value={statusFilter} onChange={(e) => handleStatusFilterChange(e.target.value)}>
                            <option value="">ทั้งหมด</option>
                            <option value="success">success</option>
                            <option value="error">error</option>
                        </select>
                    </label>
                </div>

                {loading && <div className="text-[#7b8698] text-sm">กำลังโหลด...</div>}

                {!loading && items.length === 0 && (
                    <div className="text-[#7b8698] text-sm">ยังไม่มีประวัติการเรียกใช้</div>
                )}

                {!loading && items.length > 0 && (
                    <div className="overflow-x-auto border border-[#1f2733] rounded-2xl">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[#7b8698] border-b border-[#1f2733]">
                                    <th className="px-4 py-3 font-medium">เวลา</th>
                                    <th className="px-4 py-3 font-medium">Agent</th>
                                    {currentUser?.is_admin && <th className="px-4 py-3 font-medium">Owner</th>}
                                    <th className="px-4 py-3 font-medium">v</th>
                                    <th className="px-4 py-3 font-medium">สถานะ</th>
                                    <th className="px-4 py-3 font-medium">Tokens</th>
                                    <th className="px-4 py-3 font-medium">Latency</th>
                                    <th className="px-4 py-3 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr
                                        key={item.id}
                                        onClick={() => setSelected(item)}
                                        className="border-b border-[#1f2733] last:border-0 hover:bg-[#0d1219] cursor-pointer"
                                    >
                                        <td className="px-4 py-3 text-[#a3aebc] whitespace-nowrap">{formatDate(item.created_at)}</td>
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/agents/${item.agent_id}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-[#e6edf3] hover:text-[#34d399]"
                                            >
                                                {item.agent_name}
                                            </Link>
                                        </td>
                                        {currentUser?.is_admin && (
                                            <td className="px-4 py-3 text-[#a3aebc]">{item.owner_username}</td>
                                        )}
                                        <td className="px-4 py-3 text-[#a3aebc] font-mono">v{item.prompt_version}</td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={item.status} />
                                        </td>
                                        <td className="px-4 py-3 text-[#a3aebc]">{item.total_tokens ?? "-"}</td>
                                        <td className="px-4 py-3 text-[#a3aebc]">{item.latency_ms != null ? `${item.latency_ms}ms` : "-"}</td>
                                        <td className="px-4 py-3 text-right text-[#5b6472] truncate max-w-[240px]">
                                            {item.user_prompt}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && total > 0 && (
                    <div className="flex items-center justify-between text-xs text-[#7b8698]">
                        <span>
                            {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} จากทั้งหมด {total} รายการ
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                                disabled={!canPrev}
                                className={`${ghostButtonClass} disabled:opacity-30`}
                            >
                                <IconChevronLeft size={14} className="inline -mt-0.5" />
                                ก่อนหน้า
                            </button>
                            <button
                                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                                disabled={!canNext}
                                className={`${ghostButtonClass} disabled:opacity-30`}
                            >
                                ถัดไป
                                <IconChevronRight size={14} className="inline -mt-0.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
        </div>
    );
}

export default function HistoryPage() {
    return (
        <>
            <Head>
                <title>History · DALL-M</title>
            </Head>
            <AppLayout>
                <HistoryPageContent />
            </AppLayout>
        </>
    );
}
