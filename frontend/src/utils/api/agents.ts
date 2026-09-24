import { fetchDataApi } from "@/utils/callAPI";
import {
    AgentConfigIn,
    AgentConfigOut,
    AgentCreate,
    AgentOut,
    AgentPromptOut,
    AgentUpdate,
} from "@/utils/interface/agent.types";

// GET /agents - list agents
export const getAgents = async (): Promise<AgentOut[]> => {
    return fetchDataApi("GET", "agents");
};

// GET /agents/:id - get one agent
export const getAgent = async (agentId: string): Promise<AgentOut> => {
    return fetchDataApi("GET", `agents/${agentId}`);
};

// POST /agents - create an agent (optionally with first prompt version + config)
export const createAgent = async (input: AgentCreate): Promise<AgentOut> => {
    return fetchDataApi("POST", "agents", input);
};

// PUT /agents/:id - update agent metadata
export const updateAgent = async (agentId: string, input: AgentUpdate): Promise<AgentOut> => {
    return fetchDataApi("PUT", `agents/${agentId}`, input);
};

// DELETE /agents/:id
export const deleteAgent = async (agentId: string): Promise<void> => {
    return fetchDataApi("DELETE", `agents/${agentId}`);
};

// GET /agents/:id/prompts - list prompt versions
export const getAgentPrompts = async (agentId: string): Promise<AgentPromptOut[]> => {
    return fetchDataApi("GET", `agents/${agentId}/prompts`);
};

// POST /agents/:id/prompts - add a new prompt version
export const createAgentPrompt = async (
    agentId: string,
    input: { system_prompt: string; is_active?: boolean },
): Promise<AgentPromptOut> => {
    return fetchDataApi("POST", `agents/${agentId}/prompts`, input);
};

// PUT /agents/:id/prompts/:promptId - edit the text of an existing prompt version in place
export const updateAgentPrompt = async (
    agentId: string,
    promptId: string,
    input: { system_prompt: string },
): Promise<AgentPromptOut> => {
    return fetchDataApi("PUT", `agents/${agentId}/prompts/${promptId}`, input);
};

// PUT /agents/:id/prompts/:promptId/activate
export const activateAgentPrompt = async (agentId: string, promptId: string): Promise<AgentPromptOut> => {
    return fetchDataApi("PUT", `agents/${agentId}/prompts/${promptId}/activate`, {});
};

// DELETE /agents/:id/prompts/:promptId
export const deleteAgentPrompt = async (agentId: string, promptId: string): Promise<void> => {
    return fetchDataApi("DELETE", `agents/${agentId}/prompts/${promptId}`);
};

// GET /agents/:id/config
export const getAgentConfig = async (agentId: string): Promise<AgentConfigOut | null> => {
    return fetchDataApi("GET", `agents/${agentId}/config`);
};

// PUT /agents/:id/config - upsert config
export const upsertAgentConfig = async (agentId: string, input: AgentConfigIn): Promise<AgentConfigOut> => {
    return fetchDataApi("PUT", `agents/${agentId}/config`, input);
};
