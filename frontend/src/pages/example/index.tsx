import { useRouter } from "next/navigation";
import AdminLoginPage from "@/comps/example/example";
import Head from 'next/head';

import React from 'react'

import { AppLayout } from "@/comps/layouts/AppLayout";

function PageContent() {
    // const [canRead, setCanRead] = useState(false);

    // useCheckTokenFlags(
    //     [{ flag: "read", onFlagUpdated: setCanRead }],
    //     "check_in"
    // );

    const router = useRouter();

    console.log("Admin Login Page");

    return (
        // <div className="w-[100%] h-full text-black justify-center items-center flex">Info</div>
        <div className="bg-[#343434] w-full h-full">
            <AdminLoginPage />
        </div>
    );
}


export default function AdminLogin() {
    return (
        <>
            <Head>
                <title>เข้าสู่ระบบ</title>
                <meta name="login" content="Login" />
            </Head>
            <AppLayout>
                <PageContent></PageContent>
            </AppLayout>
        </>
    );
}
