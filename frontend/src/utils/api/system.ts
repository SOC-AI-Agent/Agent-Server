import { fetchDataApi } from "@/utils/callAPI";
import { SystemResources } from "@/utils/interface/system.types";

// GET /system/resources - the host's CPU, memory, disks, model cache and llama-server state (admin only)
export const getSystemResources = async (): Promise<SystemResources> => {
    return fetchDataApi("GET", "system/resources");
};
