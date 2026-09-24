import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { IconHistory, IconLogout, IconRobot, IconUsers } from "@tabler/icons-react";
import { clearAuth, useCurrentUser } from "@/utils/authToken";

interface NavItem {
    id: string;
    label: string;
    route: string;
    icon: React.ReactNode;
}

interface NavSection {
    label: string;
    items: NavItem[];
}

interface SidebarRowProps {
    label: string;
    route: string;
    icon: React.ReactNode;
}

function SidebarRow({ label, route, icon }: SidebarRowProps) {
    const router = useRouter();
    const isActive = router.pathname === route || router.pathname.startsWith(`${route}/`);

    return (
        <Link href={route}>
            <div
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors duration-200 ${
                    isActive
                        ? "bg-[#12251c] text-[#34d399]"
                        : "text-[#a3aebc] hover:bg-[#151b26] hover:text-[#e6edf3] cursor-pointer"
                }`}
            >
                <span className="text-lg">{icon}</span>
                <span className={`text-sm ${isActive ? "font-semibold" : "font-normal"}`}>{label}</span>
            </div>
        </Link>
    );
}

function UserFooter() {
    const router = useRouter();
    const user = useCurrentUser();

    if (!user) return null;

    const handleLogout = () => {
        clearAuth();
        router.replace("/login");
    };

    return (
        <div className="px-3 py-3 border-t border-[#1f2733] flex items-center justify-between gap-2">
            <div className="flex flex-col overflow-hidden">
                <span className="text-sm text-[#e6edf3] truncate">{user.username}</span>
                <span className="text-[10px] text-[#7b8698]">{user.is_admin ? "ผู้ดูแลระบบ" : "ผู้ใช้ทั่วไป"}</span>
            </div>
            <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-[#7b8698] hover:text-[#f87171] hover:bg-[#2a1414] transition-colors shrink-0"
                title="ออกจากระบบ"
            >
                <IconLogout size={16} />
            </button>
        </div>
    );
}

function ServerStatus() {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    const [status, setStatus] = useState<"checking" | "online" | "offline">(baseUrl ? "checking" : "offline");

    useEffect(() => {
        if (!baseUrl) return;

        let cancelled = false;

        const check = () => {
            fetch(baseUrl)
                .then((res) => {
                    if (!cancelled) setStatus(res.ok ? "online" : "offline");
                })
                .catch(() => {
                    if (!cancelled) setStatus("offline");
                });
        };

        check();
        const interval = setInterval(check, 15000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [baseUrl]);

    const dotColor =
        status === "online" ? "bg-[#34d399]" : status === "offline" ? "bg-[#f87171]" : "bg-[#7b8698]";
    const label = status === "online" ? "เชื่อมต่อ Server สำเร็จ" : status === "offline" ? "เชื่อมต่อ Server ไม่ได้" : "กำลังเชื่อมต่อ...";

    return (
        <div className="px-3 py-3 border-t border-[#1f2733] flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
            <span className="text-xs text-[#7b8698]">{label}</span>
        </div>
    );
}

export function AppSidebar() {
    const user = useCurrentUser();

    const sections: NavSection[] = [
        {
            label: "ทั่วไป",
            items: [
                { id: "agents", label: "Agents", route: "/agents", icon: <IconRobot size={18} stroke={1.8} /> },
                { id: "history", label: "History", route: "/history", icon: <IconHistory size={18} stroke={1.8} /> },
            ],
        },
        ...(user?.is_admin
            ? [
                  {
                      label: "การจัดการ",
                      items: [
                          { id: "users", label: "ผู้ใช้", route: "/users", icon: <IconUsers size={18} stroke={1.8} /> },
                      ],
                  },
              ]
            : []),
    ];

    return (
        <div className="h-screen w-64 bg-[#0a0e14] border-r border-[#1f2733] flex flex-col overflow-y-auto">
            <div className="h-16 flex items-center gap-2 px-4 border-b border-[#1f2733]">
                <IconRobot size={22} className="text-[#34d399]" stroke={1.8} />
                <span className="text-lg font-bold text-[#e6edf3] font-mono">
                    DALL<span className="text-[#34d399]">-M</span>
                </span>
            </div>

            <div className="px-2 pt-3 flex-1 flex flex-col gap-4">
                {sections.map((section) => (
                    <div key={section.label} className="flex flex-col gap-1">
                        <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[#5b6472]">
                            {section.label}
                        </span>
                        {section.items.map((item) => (
                            <SidebarRow key={item.id} label={item.label} route={item.route} icon={item.icon} />
                        ))}
                    </div>
                ))}
            </div>

            <UserFooter />
            <ServerStatus />
        </div>
    );
}
