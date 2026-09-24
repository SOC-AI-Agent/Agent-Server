import { fetchDataApi } from "@/utils/callAPI";
import { UserCreate, UserOut } from "@/utils/interface/agent.types";

// GET /users - list users (used to pick an agent owner, and for user management)
export const getUsers = async (): Promise<UserOut[]> => {
    return fetchDataApi("GET", "users");
};

// POST /users - create a user (admin only)
export const createUser = async (payload: UserCreate): Promise<UserOut> => {
    return fetchDataApi("POST", "users", payload);
};

// DELETE /users/{id} - remove a user (admin only)
export const deleteUser = async (userId: string): Promise<void> => {
    return fetchDataApi("DELETE", `users/${userId}`);
};
