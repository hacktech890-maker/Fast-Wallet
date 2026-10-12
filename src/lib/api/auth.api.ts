import { api, unwrap } from "./client";
import type { ForgotPasswordResponse, MeResponse, PublicUser } from "@/lib/types";

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: true;
}

export const authApi = {
  me: () => unwrap<MeResponse>(api.get("/auth/me")),

  login: (input: { email: string; password: string }) =>
    unwrap<{ user: PublicUser }>(api.post("/auth/login", input)),

  register: (input: RegisterPayload) =>
    unwrap<{ user: PublicUser }>(api.post("/auth/register", input)),

  logout: () => unwrap<{ loggedOut: boolean }>(api.post("/auth/logout")),

  forgotPassword: (email: string) =>
    unwrap<ForgotPasswordResponse>(api.post("/auth/forgot-password", { email })),

  resetPassword: (input: { token: string; password: string; confirmPassword: string }) =>
    unwrap<{ reset: boolean; message: string }>(api.post("/auth/reset-password", input)),
};
