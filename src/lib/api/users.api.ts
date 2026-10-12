import { api, unwrap } from "./client";
import type { PublicUser } from "@/lib/types";

export const usersApi = {
  me: () => unwrap<{ user: PublicUser }>(api.get("/users/me")),

  updateMe: (input: { firstName: string; lastName: string }) =>
    unwrap<{ user: PublicUser }>(api.patch("/users/me", input)),

  changePassword: (input: { currentPassword: string; password: string; confirmPassword: string }) =>
    unwrap<{ changed: boolean; message: string }>(api.patch("/users/me/password", input)),
};
