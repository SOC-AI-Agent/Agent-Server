import { fetchDataApi } from "@/utils/callAPI";
import { InferenceRequestListOut } from "@/utils/interface/agent.types";

export interface InferenceRequestFilters {
    agent_id?: string;
    status_filter?: string;
    limit?: number;
    offset?: number;
}

// GET /inference-requests - chat history log (admin: all agents, user: own agents only; enforced server-side)
export const getInferenceRequests = async (filters: InferenceRequestFilters = {}): Promise<InferenceRequestListOut> => {
    return fetchDataApi("GET", "inference-requests", filters);
};
