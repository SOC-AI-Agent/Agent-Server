// GET /restful/system/resources — see server/app/module/system/resources.py.
// Sizes are bytes.

export interface DiskUsage {
    label: string;
    path: string;
    total: number;
    used: number;
    free: number;
}

export interface CachedModel {
    repo: string;
    size: number;
    downloading: boolean;
    served: boolean;
}

export interface SystemResources {
    host: { name: string | null; kernel: string; uptime_seconds: number };
    cpu: { model: string | null; cores: number | null; percent: number; load: number[] };
    memory: { total: number; available: number; swap_total: number; swap_free: number };
    disks: DiskUsage[];
    gpus: string[];
    llm: { status: "ok" | "loading" | "down"; model: string | null };
    models: { available: boolean; served: string | null; items: CachedModel[] };
}
