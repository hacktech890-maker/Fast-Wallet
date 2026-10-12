"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/contexts/toast-context";
import { usersApi } from "@/lib/api/users.api";
import { ApiClientError } from "@/lib/api/client";
import { profileFormSchema, passwordFormSchema, type ProfileFormValues, type PasswordFormValues } from "@/lib/schemas";
import { formatDate, initials } from "@/lib/format";

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { firstName: user?.firstName ?? "", lastName: user?.lastName ?? "" },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (user) profileForm.reset({ firstName: user.firstName, lastName: user.lastName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const saveProfile = profileForm.handleSubmit(async (values) => {
    setProfileError(null);
    try {
      const res = await usersApi.updateMe(values);
      setUser(res.user);
      toast.success("Profile updated", "Your display name was saved.");
    } catch (e) {
      setProfileError(e instanceof ApiClientError ? e.message : "Could not save profile");
    }
  });

  const savePassword = passwordForm.handleSubmit(async (values) => {
    setPasswordError(null);
    try {
      await usersApi.changePassword(values);
      passwordForm.reset();
      toast.success("Password changed", "All other sessions were signed out.");
    } catch (e) {
      setPasswordError(
        e instanceof ApiClientError
          ? e.code === "INVALID_CREDENTIALS"
            ? "Your current password is incorrect."
            : e.message
          : "Could not change password",
      );
    }
  });

  if (!user) return null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Account</p>
        <h1 className="mt-1.5 font-display text-[28px] font-bold tracking-tight sm:text-[32px]">Profile & settings</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        {/* Profile */}
        <section className="rounded-3xl border border-white/[0.07] bg-ink-850/60 p-6 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/30 to-teal-500/30 text-[18px] font-bold text-emerald-200 ring-1 ring-emerald-300/25">
              {initials(user.firstName, user.lastName)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-display text-[18px] font-bold text-zinc-50">
                  {user.firstName} {user.lastName}
                </p>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${user.role === "admin" ? "bg-amber-400/15 text-amber-300 ring-amber-300/25" : "bg-white/[0.06] text-zinc-400 ring-white/10"}`}>
                  {user.role}
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-zinc-500">
                <CalendarDays className="h-3.5 w-3.5" /> Member since {formatDate(user.createdAt)}
              </p>
            </div>
          </div>

          <form onSubmit={saveProfile} className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" error={profileForm.formState.errors.firstName?.message} htmlFor="s-first">
                <TextInput id="s-first" icon={<UserRound className="h-4 w-4" />} invalid={Boolean(profileForm.formState.errors.firstName)} {...profileForm.register("firstName")} />
              </Field>
              <Field label="Last name" error={profileForm.formState.errors.lastName?.message} htmlFor="s-last">
                <TextInput id="s-last" invalid={Boolean(profileForm.formState.errors.lastName)} {...profileForm.register("lastName")} />
              </Field>
            </div>
            <Field label="Email address" hint="Email changes are handled by support for security reasons." htmlFor="s-email">
              <TextInput id="s-email" value={user.email} readOnly disabled icon={<Mail className="h-4 w-4" />} className="opacity-60" />
            </Field>
            {profileError ? (
              <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-200">{profileError}</p>
            ) : null}
            <Button type="submit" loading={profileForm.formState.isSubmitting}>
              Save profile
            </Button>
          </form>
        </section>

        <div className="space-y-5">
          {/* Security */}
          <section className="rounded-3xl border border-white/[0.07] bg-ink-850/60 p-6 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <Lock className="h-4.5 w-4.5 text-emerald-300" />
              <h2 className="font-display text-[16px] font-semibold">Change password</h2>
            </div>
            <form onSubmit={savePassword} className="mt-5 space-y-4">
              <Field label="Current password" error={passwordForm.formState.errors.currentPassword?.message} htmlFor="cur-pw">
                <TextInput id="cur-pw" type="password" autoComplete="current-password" placeholder="••••••••" invalid={Boolean(passwordForm.formState.errors.currentPassword)} {...passwordForm.register("currentPassword")} />
              </Field>
              <Field label="New password" error={passwordForm.formState.errors.password?.message} htmlFor="new-pw">
                <TextInput id="new-pw" type="password" autoComplete="new-password" placeholder="8+ characters" invalid={Boolean(passwordForm.formState.errors.password)} {...passwordForm.register("password")} />
              </Field>
              <Field label="Confirm new password" error={passwordForm.formState.errors.confirmPassword?.message} htmlFor="new-pw2">
                <TextInput id="new-pw2" type="password" autoComplete="new-password" placeholder="Repeat the new password" invalid={Boolean(passwordForm.formState.errors.confirmPassword)} {...passwordForm.register("confirmPassword")} />
              </Field>
              {passwordError ? (
                <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-200">{passwordError}</p>
              ) : null}
              <Button type="submit" variant="secondary" loading={passwordForm.formState.isSubmitting} className="w-full">
                <ShieldCheck className="h-4 w-4" />
                Update password
              </Button>
              <p className="text-center text-[11.5px] text-zinc-600">
                Every active session — including this one — is re-issued after a password change.
              </p>
            </form>
          </section>

          {/* Payments & verification */}
          <section className="rounded-3xl border border-emerald-300/20 bg-emerald-400/[0.05] p-6">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4.5 w-4.5 text-emerald-300" />
              <h2 className="font-display text-[16px] font-semibold text-emerald-100">Payments & verification</h2>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-emerald-100/70">
              Card deposits credit automatically once our payment provider confirms the charge via a signed server-side
              webhook — refreshing the page never changes your balance. Crypto deposits credit after administrator
              verification of the on-chain transfer. All administrative actions are written to an audit log.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
