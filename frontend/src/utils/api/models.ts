import { fetchDataApi } from "@/utils/callAPI";
import { LlmModelCreate, LlmModelOut, LlmModelUpdate } from "@/utils/interface/agent.types";

// GET /models - list available LLM models (used to assign an agent's model)
export const getModels = async (): Promise<LlmModelOut[]> => {
    return fetchDataApi("GET", "models");
};

// POST /models - create or upsert an LLM model (admin only)
export const upsertModel = async (payload: LlmModelCreate): Promise<LlmModelOut> => {
    return fetchDataApi("POST", "models", payload);
};

// PUT /models/{id} - update an existing LLM model (admin only)
export const updateModel = async (modelId: string, payload: LlmModelUpdate): Promise<LlmModelOut> => {
    return fetchDataApi("PUT", `models/${modelId}`, payload);
};

// DELETE /models/{id} - remove an LLM model (admin only)
export const deleteModel = async (modelId: string): Promise<void> => {
    return fetchDataApi("DELETE", `models/${modelId}`);
};
