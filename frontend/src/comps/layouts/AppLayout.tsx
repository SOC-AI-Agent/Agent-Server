import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useMediaQuery } from "@/comps/public/useMediaQuery";
import { getToken } from "@/utils/authToken";
import { AppSidebar } from "./AppSidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
    const isLargerThanSm = useMediaQuery("(min-width: 768px)");
    const router = useRouter();
    const [authChecked, setAuthChecked] = useState(false);

    useEffect(() => {
        const check = () => {
            if (!getToken()) {
                router.replace("/login");
                return;
            }
            setAuthChecked(true);
        };
        check();
    }, [router]);

    if (!authChecked) {
        return <div className="h-screen w-full bg-[#0a0e14]" />;
    }

    return (
        <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
            {isLargerThanSm && <AppSidebar />}

            <main className="flex-1 h-screen overflow-y-auto bg-[#0a0e14]">
                {children}
            </main>
        </div>
    );
}
