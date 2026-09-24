import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { IconPlus, IconTrash, IconUsers } from "@tabler/icons-react";
import { AppLayout } from "@/comps/layouts/AppLayout";
import { useNotification } from "@/comps/noti/notiComp";
import { deleteUser, getUsers } from "@/utils/api/users";
import { UserOut } from "@/utils/interface/agent.types";
import { getErrorMessage } from "@/utils/errorMessage";
import { useCurrentUser } from "@/utils/authToken";

function UsersPageContent() {
    const router = useRouter();
    const currentUser = useCurrentUser();
    const { showNotification } = useNotification();

    const [users, setUsers] = useState<UserOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [guardChecked, setGuardChecked] = useState(false);

    useEffect(() => {
        if (currentUser === null) return; // still reading from localStorage
        const check = () => {
            if (!currentUser.is_admin) {
                router.replace("/agents");
                return;
            }
            setGuardChecked(true);
        };
        check();
    }, [currentUser, router]);

    const load = () => {
        getUsers()
            .then(setUsers)
            .catch((err) => showNotification("โหลดข้อมูลไม่สำเร็จ", getErrorMessage(err), "error"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (guardChecked) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guardChecked]);

    const handleDelete = async (user: UserOut) => {
        if (!window.confirm(`ลบผู้ใช้ "${user.username}" ใช่หรือไม่?`)) return;
        try {
            await deleteUser(user.id);
            showNotification("ลบสำเร็จ", `ลบผู้ใช้ "${user.username}" แล้ว`, "success");
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
                    <IconUsers size={20} className="text-[#34d399]" />
                    <span className="text-[#e6edf3] font-semibold">ผู้ใช้</span>
                </div>
                <Link
                    href="/users/new"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#12251c] text-[#34d399] text-sm font-medium hover:bg-[#16311f] transition-colors"
                >
                    <IconPlus size={16} />
                    เพิ่มผู้ใช้
                </Link>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {loading && <div className="text-[#7b8698] text-sm">กำลังโหลด...</div>}

                {!loading && users.length === 0 && (
                    <div className="text-[#7b8698] text-sm">ยังไม่มีผู้ใช้ในระบบ</div>
                )}

                {!loading && users.length > 0 && (
                    <div className="overflow-x-auto border border-[#1f2733] rounded-2xl">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[#7b8698] border-b border-[#1f2733]">
                                    <th className="px-4 py-3 font-medium">Username</th>
                                    <th className="px-4 py-3 font-medium">Email</th>
                                    <th className="px-4 py-3 font-medium">สิทธิ์</th>
                                    <th className="px-4 py-3 font-medium">สถานะ</th>
                                    <th className="px-4 py-3 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => {
                                    const isSelf = currentUser?.id === u.id;
                                    return (
                                        <tr key={u.id} className="border-b border-[#1f2733] last:border-0 hover:bg-[#0d1219]">
                                            <td className="px-4 py-3 text-[#e6edf3]">
                                                {u.username}
                                                {isSelf && <span className="text-[#7b8698]"> (คุณ)</span>}
                                            </td>
                                            <td className="px-4 py-3 text-[#a3aebc]">{u.email}</td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`text-xs px-2 py-1 rounded-full ${
                                                        u.is_admin
                                                            ? "bg-[#1f2a12] text-[#a3e635]"
                                                            : "bg-[#1f2733] text-[#7b8698]"
                                                    }`}
                                                >
                                                    {u.is_admin ? "Admin" : "User"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`text-xs px-2 py-1 rounded-full ${
                                                        u.is_active
                                                            ? "bg-[#12251c] text-[#34d399]"
                                                            : "bg-[#1f2733] text-[#7b8698]"
                                                    }`}
                                                >
                                                    {u.is_active ? "active" : "inactive"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => handleDelete(u)}
                                                    disabled={isSelf}
                                                    title={isSelf ? "ลบบัญชีตัวเองไม่ได้" : "ลบผู้ใช้"}
                                                    className="p-1.5 rounded-lg text-[#7b8698] hover:text-[#f87171] hover:bg-[#2a1414] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#7b8698]"
                                                >
                                                    <IconTrash size={16} />
                                                </button>
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

export default function UsersPage() {
    return (
        <>
            <Head>
                <title>ผู้ใช้ · DALL-M</title>
            </Head>
            <AppLayout>
                <UsersPageContent />
            </AppLayout>
        </>
    );
}
