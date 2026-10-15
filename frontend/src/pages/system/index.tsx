import Head from "next/head";
import { AppLayout } from "@/comps/layouts/AppLayout";
import ResourcesPanel from "@/comps/system/ResourcesPanel";

export default function SystemPage() {
    return (
        <>
            <Head>
                <title>Resources · DALL-M</title>
            </Head>
            <AppLayout>
                <ResourcesPanel />
            </AppLayout>
        </>
    );
}
