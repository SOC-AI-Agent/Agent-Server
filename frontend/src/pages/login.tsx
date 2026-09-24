import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { IconRobot } from "@tabler/icons-react";
import { useNotification } from "@/comps/noti/notiComp";
import { login } from "@/utils/api/auth";
import { getToken, setAuth } from "@/utils/authToken";
import { getErrorMessage } from "@/utils/errorMessage";
import { inputClass, labelClass, primaryButtonClass } from "@/comps/agents/formStyles";

export default function LoginPage() {
    const router = useRouter();
    const { showNotification } = useNotification();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (getToken()) {
            router.replace("/agents");
        }
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!username.trim() || !password) {
            showNotification("กรอกข้อมูลไม่ครบ", "กรุณากรอก username และ password", "error");
            return;
        }

        setSubmitting(true);
        try {
            const res = await login(username.trim(), password);
            setAuth(res.access_token, res.user);
            router.replace("/agents");
        } catch (err) {
            showNotification("เข้าสู่ระบบไม่สำเร็จ", getErrorMessage(err), "error");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Head>
                <title>เข้าสู่ระบบ · DALL-M</title>
            </Head>
            <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0e14] px-4">
                <div className="w-full max-w-sm bg-[#10151f] border border-[#1f2733] rounded-2xl p-6 flex flex-col gap-5">
                    <div className="flex items-center justify-center gap-2">
                        <IconRobot size={26} className="text-[#34d399]" stroke={1.8} />
                        <span className="text-xl font-bold text-[#e6edf3] font-mono">
                            DALL<span className="text-[#34d399]">-M</span>
                        </span>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <label className={labelClass}>
                            Username
                            <input
                                className={inputClass}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoFocus
                                autoComplete="username"
                            />
                        </label>
                        <label className={labelClass}>
                            Password
                            <input
                                className={inputClass}
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                            />
                        </label>
                        <button type="submit" disabled={submitting} className={primaryButtonClass}>
                            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}
