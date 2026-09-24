import { fetchDataApi } from "@/utils/callAPI";
import { LlmModelOut } from "@/utils/interface/agent.types";

// GET /models - list available LLM models (used to assign an agent's model)
export const getModels = async (): Promise<LlmModelOut[]> => {
    return fetchDataApi("GET", "models");
};
