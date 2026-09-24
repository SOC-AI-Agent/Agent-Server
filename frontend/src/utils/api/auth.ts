import { fetchDataApi } from "@/utils/callAPI";
import { AuthUser } from "@/utils/authToken";

export interface LoginResponse {
    access_token: string;
    token_type: string;
    user: AuthUser;
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
    return fetchDataApi("POST", "auth/login", { username, password });
};
