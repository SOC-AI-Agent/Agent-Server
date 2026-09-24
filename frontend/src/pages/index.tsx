import Head from "next/head";
import { AppLayout } from "@/comps/layouts/AppLayout";

export default function Home() {
    return (
        <>
            <Head>
                <title>DALL-M</title>
            </Head>
            <AppLayout>
                <div className="h-full w-full" />
            </AppLayout>
        </>
    );
}
