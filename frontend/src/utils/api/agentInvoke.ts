// Client for the public agent-invocation surface (/v1/agents/...), which lives
// outside the /restful-prefixed CRUD API and is called directly (no auth token).

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8001";

export interface AgentChatDone {
    latency_ms: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
}

export interface AgentChatResult {
    agent: string;
    prompt_version: number;
    content: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
    total_tokens?: number | null;
    latency_ms: number;
}

export function buildAgentChatUrl(slug: string, version: number | null): string {
    return version != null
        ? `${baseUrl}/v1/agents/${slug}/versions/${version}/chat`
        : `${baseUrl}/v1/agents/${slug}/chat`;
}

// Non-streaming call — resolves with the full response body.
export async function chatWithAgentOnce(
    slug: string,
    version: number | null,
    message: string,
): Promise<AgentChatResult> {
    const res = await fetch(buildAgentChatUrl(slug, version), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, stream: false }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.detail || res.statusText);
    }
    return data;
}

// Streaming call — parses the backend's SSE format (event: token/done/error)
// and reports progress through callbacks as chunks arrive.
export async function streamAgentChat(
    slug: string,
    version: number | null,
    message: string,
    handlers: {
        onToken: (content: string) => void;
        onDone: (info: AgentChatDone) => void;
        onError: (message: string) => void;
    },
    signal?: AbortSignal,
): Promise<void> {
    let res: Response;
    try {
        res = await fetch(buildAgentChatUrl(slug, version), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, stream: true }),
            signal,
        });
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        handlers.onError(err instanceof Error ? err.message : "การเชื่อมต่อล้มเหลว");
        return;
    }

    if (!res.ok || !res.body) {
        let detail = res.statusText;
        try {
            const data = await res.json();
            detail = data?.detail || detail;
        } catch {
            // response wasn't JSON, keep statusText
        }
        handlers.onError(detail);
        return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let sepIndex;
            while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
                const rawEvent = buffer.slice(0, sepIndex);
                buffer = buffer.slice(sepIndex + 2);
                if (!rawEvent.trim()) continue;

                let eventType = "message";
                let data = "";
                for (const line of rawEvent.split("\n")) {
                    if (line.startsWith("event:")) eventType = line.slice(6).trim();
                    else if (line.startsWith("data:")) data += line.slice(5).trim();
                }
                if (!data) continue;

                let parsed: Record<string, unknown>;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    continue;
                }

                if (eventType === "token") handlers.onToken(typeof parsed.content === "string" ? parsed.content : "");
                else if (eventType === "done") handlers.onDone(parsed as unknown as AgentChatDone);
                else if (eventType === "error")
                    handlers.onError(typeof parsed.message === "string" ? parsed.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
            }
        }
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        handlers.onError(err instanceof Error ? err.message : "การอ่านข้อมูล stream ล้มเหลว");
    }
}
