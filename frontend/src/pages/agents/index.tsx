import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconPlus, IconTrash, IconRobot } from "@tabler/icons-react";
import { AppLayout } from "@/comps/layouts/AppLayout";
import { useNotification } from "@/comps/noti/notiComp";
import { deleteAgent, getAgents } from "@/utils/api/agents";
import { getUsers } from "@/utils/api/users";
import { getModels } from "@/utils/api/models";
import { AgentOut, LlmModelOut, UserOut } from "@/utils/interface/agent.types";
import { getErrorMessage } from "@/utils/errorMessage";

function AgentsPageContent() {
    const [agents, setAgents] = useState<AgentOut[]>([]);
    const [users, setUsers] = useState<UserOut[]>([]);
    const [models, setModels] = useState<LlmModelOut[]>([]);
    const [loading, setLoading] = useState(true);
    const { showNotification } = useNotification();

    const load = () => {
        Promise.all([getAgents(), getUsers(), getModels()])
            .then(([agentsRes, usersRes, modelsRes]) => {
                setAgents(agentsRes);
                setUsers(usersRes);
                setModels(modelsRes);
            })
            .catch((err) => showNotification("โหลดข้อมูลไม่สำเร็จ", getErrorMessage(err), "error"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const userMap = new Map(users.map((u) => [u.id, u.username]));
    const modelMap = new Map(models.map((m) => [m.id, m.name]));

    const handleDelete = async (agent: AgentOut) => {
        if (!window.confirm(`ลบ Agent "${agent.name}" ใช่หรือไม่?`)) return;
        try {
            await deleteAgent(agent.id);
            showNotification("ลบสำเร็จ", `ลบ Agent "${agent.name}" แล้ว`, "success");
            load();
        } catch (err) {
            showNotification("ลบไม่สำเร็จ", getErrorMessage(err), "error");
        }
    };

    return (
        <div className="flex flex-col h-screen w-full">
            <div className="h-16 flex items-center justify-between px-6 border-b border-[#1f2733] shrink-0">
                <div className="flex items-center gap-2">
                    <IconRobot size={20} className="text-[#34d399]" />
                    <span className="text-[#e6edf3] font-semibold">Agents</span>
                </div>
                <Link
                    href="/agents/new"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#12251c] text-[#34d399] text-sm font-medium hover:bg-[#16311f] transition-colors"
                >
                    <IconPlus size={16} />
                    สร้าง Agent
                </Link>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {loading && <div className="text-[#7b8698] text-sm">กำลังโหลด...</div>}

                {!loading && agents.length === 0 && (
                    <div className="text-[#7b8698] text-sm">ยังไม่มี Agent — เริ่มสร้าง Agent แรกของคุณ</div>
                )}

                {!loading && agents.length > 0 && (
                    <div className="overflow-x-auto border border-[#1f2733] rounded-2xl">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[#7b8698] border-b border-[#1f2733]">
                                    <th className="px-4 py-3 font-medium">Slug</th>
                                    <th className="px-4 py-3 font-medium">ชื่อ</th>
                                    <th className="px-4 py-3 font-medium">Model</th>
                                    <th className="px-4 py-3 font-medium">Owner</th>
                                    <th className="px-4 py-3 font-medium">สถานะ</th>
                                    <th className="px-4 py-3 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {agents.map((agent) => (
                                    <tr key={agent.id} className="border-b border-[#1f2733] last:border-0 hover:bg-[#0d1219]">
                                        <td className="px-4 py-3 font-mono text-[#a3aebc]">{agent.slug}</td>
                                        <td className="px-4 py-3">
                                            <Link href={`/agents/${agent.id}`} className="text-[#e6edf3] hover:text-[#34d399]">
                                                {agent.name}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 text-[#a3aebc]">
                                            {agent.model_id ? modelMap.get(agent.model_id) ?? "-" : "-"}
                                        </td>
                                        <td className="px-4 py-3 text-[#a3aebc]">{userMap.get(agent.owner_id) ?? "-"}</td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`text-xs px-2 py-1 rounded-full ${
                                                    agent.is_active
                                                        ? "bg-[#12251c] text-[#34d399]"
                                                        : "bg-[#1f2733] text-[#7b8698]"
                                                }`}
                                            >
                                                {agent.is_active ? "active" : "inactive"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => handleDelete(agent)}
                                                className="p-1.5 rounded-lg text-[#7b8698] hover:text-[#f87171] hover:bg-[#2a1414] transition-colors"
                                                title="ลบ Agent"
                                            >
                                                <IconTrash size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AgentsPage() {
    return (
        <>
            <Head>
                <title>Agents · DALL-M</title>
            </Head>
            <AppLayout>
                <AgentsPageContent />
            </AppLayout>
        </>
    );
}
