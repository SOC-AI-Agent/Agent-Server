import { useEffect, useState } from "react";

export interface AuthUser {
    id: string;
    username: string;
    email: string;
    is_active: boolean;
    is_admin: boolean;
    created_at: string;
    updated_at: string;
}

interface StoredAuth {
    token: string;
    user: AuthUser;
    expiresAt: number;
}

const STORAGE_KEY = "dallm_auth";
const SESSION_MS = 24 * 60 * 60 * 1000; // keep in sync with server JWT_EXPIRE_MINUTES

function readStorage(): StoredAuth | null {
    if (typeof window === "undefined") return null;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as StoredAuth;
        if (!parsed.expiresAt || Date.now() >= parsed.expiresAt) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch (e) {
        console.error("Failed to parse stored auth:", e);
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

export const setAuth = (token: string, user: AuthUser): void => {
    if (typeof window === "undefined") return;
    const stored: StoredAuth = { token, user, expiresAt: Date.now() + SESSION_MS };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
};

export const getToken = (): string | null => {
    return readStorage()?.token ?? null;
};

export const getUser = (): AuthUser | null => {
    return readStorage()?.user ?? null;
};

export const clearAuth = (): void => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
};

/** Reads the logged-in user from localStorage after mount (avoids SSR/client mismatch). */
export function useCurrentUser(): AuthUser | null {
    const [user, setUser] = useState<AuthUser | null>(null);

    useEffect(() => {
        const load = () => setUser(getUser());
        load();
    }, []);

    return user;
}
