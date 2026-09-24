import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { IconArrowLeft, IconShieldCheck, IconUser, IconUserPlus } from "@tabler/icons-react";
import { AppLayout } from "@/comps/layouts/AppLayout";
import { useNotification } from "@/comps/noti/notiComp";
import { createUser } from "@/utils/api/users";
import { ghostButtonClass, inputClass, labelClass, primaryButtonClass, sectionClass } from "@/comps/agents/formStyles";
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

function roleCardClass(active: boolean): string {
    return `flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-colors cursor-pointer ${
        active
            ? "border-[#34d399] bg-[#12251c]"
            : "border-[#1f2733] bg-[#0a0e14] hover:border-[#2a3441] hover:bg-[#0d1219]"
    }`;
}

function NewUserPageContent() {
    const router = useRouter();
    const currentUser = useCurrentUser();
    const { showNotification } = useNotification();

    const [guardChecked, setGuardChecked] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isAdminFlag, setIsAdminFlag] = useState(false);

    useEffect(() => {
        if (currentUser === null) return;
        const check = () => {
            if (!currentUser.is_admin) {
                router.replace("/agents");
                return;
            }
            setGuardChecked(true);
        };
        check();
    }, [currentUser, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!username.trim() || !email.trim() || !password) {
            showNotification("กรอกข้อมูลไม่ครบ", "กรุณากรอก username, email และ password", "error");
            return;
        }

        setSubmitting(true);
        try {
            const user = await createUser({
                username: username.trim(),
                email: email.trim(),
                password,
                is_admin: isAdminFlag,
            });
            showNotification("สร้างสำเร็จ", `สร้างผู้ใช้ "${user.username}" แล้ว`, "success");
            router.push("/users");
        } catch (err) {
            showNotification("สร้างไม่สำเร็จ", getErrorMessage(err), "error");
        } finally {
            setSubmitting(false);
        }
    };

    if (!guardChecked) return null;

    return (
        <div className="flex flex-col h-screen w-full">
            <div className="h-16 flex items-center gap-3 px-6 border-b border-[#1f2733] shrink-0">
                <Link
                    href="/users"
                    className="p-1.5 -ml-1.5 rounded-lg text-[#7b8698] hover:text-[#e6edf3] hover:bg-[#151b26] transition-colors"
                >
                    <IconArrowLeft size={18} />
                </Link>
                <span className="text-[#e6edf3] font-semibold">เพิ่มผู้ใช้ใหม่</span>
            </div>

            <div className="flex-1 overflow-y-auto">
                <form onSubmit={handleSubmit} className="max-w-xl mx-auto p-6 md:p-8 flex flex-col gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[#12251c] flex items-center justify-center shrink-0">
                            <IconUserPlus size={22} className="text-[#34d399]" stroke={1.8} />
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold text-[#e6edf3]">เพิ่มผู้ใช้ใหม่</h1>
                            <p className="text-sm text-[#7b8698]">สร้างบัญชีสำหรับเข้าใช้งานระบบ DALL-M</p>
                        </div>
                    </div>

                    <div className={sectionClass}>
                        <SectionTitle icon={<IconUser size={18} stroke={1.8} />}>ข้อมูลบัญชี</SectionTitle>

                        <label className={labelClass}>
                            Username *
                            <input
                                className={inputClass}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="somchai"
                                autoComplete="off"
                                required
                            />
                        </label>
                        <label className={labelClass}>
                            Email *
                            <input
                                className={inputClass}
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="somchai@example.com"
                                autoComplete="off"
                                required
                            />
                        </label>
                        <label className={labelClass}>
                            <span className="flex items-baseline gap-1.5">
                                Password * <FieldHint>ตั้งรหัสผ่านเริ่มต้นให้ผู้ใช้</FieldHint>
                            </span>
                            <input
                                className={inputClass}
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                            />
                        </label>
                    </div>

                    <div className={sectionClass}>
                        <SectionTitle icon={<IconShieldCheck size={18} stroke={1.8} />}>สิทธิ์การใช้งาน</SectionTitle>

                        <div className="grid grid-cols-2 gap-3">
                            <div
                                role="radio"
                                aria-checked={!isAdminFlag}
                                tabIndex={0}
                                onClick={() => setIsAdminFlag(false)}
                                onKeyDown={(e) => e.key === "Enter" && setIsAdminFlag(false)}
                                className={roleCardClass(!isAdminFlag)}
                            >
                                <IconUser size={18} className={!isAdminFlag ? "text-[#34d399]" : "text-[#7b8698]"} stroke={1.8} />
                                <span className={`text-sm font-medium ${!isAdminFlag ? "text-[#e6edf3]" : "text-[#a3aebc]"}`}>
                                    ผู้ใช้ทั่วไป
                                </span>
                                <span className="text-xs text-[#7b8698]">สร้างและจัดการ Agent ของตัวเองได้</span>
                            </div>
                            <div
                                role="radio"
                                aria-checked={isAdminFlag}
                                tabIndex={0}
                                onClick={() => setIsAdminFlag(true)}
                                onKeyDown={(e) => e.key === "Enter" && setIsAdminFlag(true)}
                                className={roleCardClass(isAdminFlag)}
                            >
                                <IconShieldCheck size={18} className={isAdminFlag ? "text-[#34d399]" : "text-[#7b8698]"} stroke={1.8} />
                                <span className={`text-sm font-medium ${isAdminFlag ? "text-[#e6edf3]" : "text-[#a3aebc]"}`}>
                                    ผู้ดูแลระบบ
                                </span>
                                <span className="text-xs text-[#7b8698]">เพิ่ม/ลบผู้ใช้และทำทุกอย่างได้</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <Link href="/users" className={ghostButtonClass}>
                            ยกเลิก
                        </Link>
                        <button type="submit" disabled={submitting} className={primaryButtonClass}>
                            {submitting ? "กำลังสร้าง..." : "สร้างผู้ใช้"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function NewUserPage() {
    return (
        <>
            <Head>
                <title>เพิ่มผู้ใช้ · DALL-M</title>
            </Head>
            <AppLayout>
                <NewUserPageContent />
            </AppLayout>
        </>
    );
}
