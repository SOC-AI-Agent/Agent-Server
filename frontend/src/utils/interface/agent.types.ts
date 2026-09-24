export interface UserOut {
    id: string;
    username: string;
    email: string;
    is_active: boolean;
    is_admin: boolean;
    created_at: string;
    updated_at: string;
}

export interface UserCreate {
    username: string;
    email: string;
    password?: string;
    is_active?: boolean;
    is_admin?: boolean;
}

export interface LlmModelOut {
    id: string;
    name: string;
    model_name: string;
    provider?: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface AgentConfigIn {
    temperature?: number | null;
    max_tokens?: number | null;
    top_p?: number | null;
    top_k?: number | null;
    context_window?: number | null;
    repetition_penalty?: number | null;
    seed?: number | null;
    streaming_enabled?: boolean | null;
    extra_config?: Record<string, unknown> | null;
}

export interface AgentConfigOut extends AgentConfigIn {
    id: string;
    agent_id: string;
    streaming_enabled: boolean;
    created_at: string;
    updated_at: string;
}

export interface AgentPromptOut {
    id: string;
    agent_id: string;
    version: number;
    system_prompt: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface AgentOut {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    owner_id: string;
    model_id?: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface AgentCreate {
    slug: string;
    name: string;
    description?: string;
    owner_id: string;
    model_id?: string;
    is_active?: boolean;
    system_prompt?: string;
    config?: AgentConfigIn;
}

export interface AgentUpdate {
    slug?: string;
    name?: string;
    description?: string;
    model_id?: string;
    is_active?: boolean;
}

export interface InferenceRequestOut {
    id: string;
    agent_id: string;
    agent_slug: string;
    agent_name: string;
    owner_id: string;
    owner_username: string;
    prompt_id: string;
    prompt_version: number;
    model_id?: string | null;
    model_name?: string | null;
    user_prompt: string;
    assistant_response?: string | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
    total_tokens?: number | null;
    latency_ms?: number | null;
    status: string;
    error_message?: string | null;
    created_at: string;
}

export interface InferenceRequestListOut {
    items: InferenceRequestOut[];
    total: number;
    limit: number;
    offset: number;
}
