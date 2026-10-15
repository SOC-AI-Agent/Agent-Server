import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { IconRefresh, IconServer } from "@tabler/icons-react";
import { useNotification } from "@/comps/noti/notiComp";
import { ghostButtonClass, sectionClass } from "@/comps/agents/formStyles";
import { getSystemResources } from "@/utils/api/system";
import { SystemResources } from "@/utils/interface/system.types";
import { getErrorMessage } from "@/utils/errorMessage";
import { useCurrentUser } from "@/utils/authToken";

const REFRESH_MS = 5000;

function gb(bytes: number): string {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function duration(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days > 0 ? `${days} วัน ${hours} ชม.` : `${hours} ชม. ${minutes} นาที`;
}

// Green below 70%, amber below 90%, red above.
function Meter({ percent }: { percent: number }) {
    const color = percent < 70 ? "bg-[#34d399]" : percent < 90 ? "bg-[#fbbf24]" : "bg-[#f87171]";
    return (
        <div className="h-2 w-full rounded-full bg-[#1f2733] overflow-hidden">
            <div className={`h-full ${color}`} style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
        </div>
    );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex justify-between gap-4 text-sm">
            <span className="text-[#7b8698]">{label}</span>
            <span className="text-[#e6edf3] text-right break-all">{value}</span>
        </div>
    );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className={sectionClass}>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#5b6472]">{title}</span>
            {children}
        </div>
    );
}

function LlmBadge({ status }: { status: SystemResources["llm"]["status"] }) {
    const style = {
        ok: "bg-[#12251c] text-[#34d399]",
        loading: "bg-[#2a2414] text-[#fbbf24]",
        down: "bg-[#2a1414] text-[#f87171]",
    }[status];
    const label = { ok: "พร้อมใช้งาน", loading: "กำลังโหลด model", down: "ติดต่อไม่ได้" }[status];
    return <span className={`text-xs px-2 py-1 rounded-full ${style}`}>{label}</span>;
}

function ResourcesView({ data }: { data: SystemResources }) {
    const { host, cpu, memory, disks, gpus, llm, models } = data;
    const memUsed = memory.total - memory.available;
    const swapUsed = memory.swap_total - memory.swap_free;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="เครื่อง">
                <Row label="ระบบปฏิบัติการ" value={host.name ?? "-"} />
                <Row label="Kernel" value={<span className="font-mono text-xs">{host.kernel}</span>} />
                <Row label="เปิดมาแล้ว" value={duration(host.uptime_seconds)} />
                <Row label="GPU" value={gpus.length ? gpus.join(", ") : "ไม่มี (ใช้ CPU)"} />
            </Card>

            <Card title="CPU">
                <Row label="ใช้อยู่" value={`${cpu.percent}%`} />
                <Meter percent={cpu.percent} />
                <Row label="จำนวน core" value={cpu.cores ?? "-"} />
                <Row label="รุ่น" value={cpu.model ?? "-"} />
                <Row label="Load (1 / 5 / 15 นาที)" value={cpu.load.join(" / ")} />
            </Card>

            <Card title="หน่วยความจำ (RAM)">
                <Row label="ใช้อยู่" value={`${gb(memUsed)} / ${gb(memory.total)}`} />
                <Meter percent={(100 * memUsed) / Math.max(memory.total, 1)} />
                <Row label="ว่าง (ใช้ได้จริง)" value={gb(memory.available)} />
                <Row label="Swap ใช้อยู่" value={memory.swap_total ? `${gb(swapUsed)} / ${gb(memory.swap_total)}` : "ไม่มี"} />
            </Card>

            <Card title="ดิสก์">
                {disks.map((d) => (
                    <div key={d.path} className="flex flex-col gap-1.5">
                        <Row label={d.label} value={`${gb(d.used)} / ${gb(d.total)} (ว่าง ${gb(d.free)})`} />
                        <Meter percent={(100 * d.used) / Math.max(d.total, 1)} />
                    </div>
                ))}
            </Card>

            <Card title="LLM (llama.cpp)">
                <Row label="สถานะ" value={<LlmBadge status={llm.status} />} />
                <Row label="Model ที่ใช้ตอบ" value={<span className="font-mono text-xs">{llm.model ?? models.served ?? "-"}</span>} />
            </Card>

            <Card title="Model ที่โหลดไว้">
                {!models.available && <span className="text-sm text-[#7b8698]">อ่าน model cache ไม่ได้</span>}
                {models.available && models.items.length === 0 && <span className="text-sm text-[#7b8698]">ยังไม่มี model</span>}
                {models.items.map((m) => {
                    // A rough fit: llama.cpp needs about the file's size in RAM, plus some for the context.
                    const ramNeeded = m.size * 1.2;
                    const status = m.served ? "ใช้ตอบอยู่" : m.downloading ? "กำลังโหลด" : "พร้อมสลับ";
                    return (
                        <div key={m.repo} className="flex flex-col gap-0.5 border-b border-[#1f2733] last:border-0 pb-2 last:pb-0">
                            <span className="font-mono text-xs text-[#e6edf3] break-all">{m.repo}</span>
                            <span className="text-xs text-[#7b8698]">
                                {gb(m.size)} · {status} · RAM ที่ต้องใช้ราว {gb(ramNeeded)}
                                {ramNeeded > memory.total && <span className="text-[#f87171]"> (เกิน RAM ของเครื่อง)</span>}
                            </span>
                        </div>
                    );
                })}
            </Card>
        </div>
    );
}

// Admins only, refreshed every REFRESH_MS while the page is open.
export default function ResourcesPanel() {
    const router = useRouter();
    const currentUser = useCurrentUser();
    const { showNotification } = useNotification();

    const [data, setData] = useState<SystemResources | null>(null);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = () => {
        getSystemResources()
            .then((res) => {
                setData(res);
                setUpdatedAt(new Date());
                setError(null);
            })
            .catch((err) => setError(getErrorMessage(err)));
    };

    useEffect(() => {
        if (currentUser === null) return; // still reading from localStorage
        if (!currentUser.is_admin) {
            router.replace("/agents");
            return;
        }
        load();
        const interval = setInterval(load, REFRESH_MS);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser]);

    useEffect(() => {
        if (error) showNotification("โหลดข้อมูลเครื่องไม่สำเร็จ", error, "error");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [error]);

    return (
        <div className="flex flex-col h-screen w-full">
            <div className="h-16 flex items-center justify-between px-6 border-b border-[#1f2733] shrink-0">
                <div className="flex items-center gap-2">
                    <IconServer size={20} className="text-[#34d399]" />
                    <span className="text-[#e6edf3] font-semibold">Resources</span>
                    <span className="text-xs text-[#5b6472]">
                        · อัปเดตทุก {REFRESH_MS / 1000} วินาที
                        {updatedAt && ` · ล่าสุด ${updatedAt.toLocaleTimeString("th-TH")}`}
                    </span>
                </div>
                <button onClick={load} className={ghostButtonClass}>
                    <IconRefresh size={14} className="inline mr-1 -mt-0.5" />
                    รีเฟรช
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {!data && !error && <div className="text-[#7b8698] text-sm">กำลังโหลด...</div>}
                {data && <ResourcesView data={data} />}
            </div>
        </div>
    );
}
