"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, KeyRound, Lock, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { authApi } from "@/lib/api/auth.api";
import { ApiClientError } from "@/lib/api/client";
import { useToast } from "@/contexts/toast-context";
import { resetFormSchema, type ResetFormValues } from "@/lib/schemas";

export default function ResetPasswordPage() {
  const router = useRouter();
  const toast = useToast();
  const [rootError, setRootError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormValues>({ resolver: zodResolver(resetFormSchema), defaultValues: { token: "", password: "", confirmPassword: "" } });

  // Prefill the token when arriving from the email link (?token=…).
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) setValue("token", token, { shouldValidate: true });
  }, [setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setRootError(null);
    try {
      await authApi.resetPassword(values);
      setDone(true);
      toast.success("Password updated", "Every previous session was signed out.");
    } catch (e) {
      if (e instanceof ApiClientError) {
        setRootError(e.code === "RESET_TOKEN_INVALID" ? "This reset link is invalid or has expired. Request a new one." : e.message);
      } else setRootError("Cannot reach the server. Please retry.");
    }
  });

  return (
    <div>
      <Link href="/login" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-400 transition hover:text-emerald-300">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to sign in
      </Link>

      <h1 className="mt-5 font-display text-[30px] font-bold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">
        Paste your reset token and set a new password. All active sessions are invalidated on success.
      </p>

      {done ? (
        <div className="mt-7 flex flex-col items-start gap-4">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.07] p-4">
            <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <p className="text-[13.5px] leading-relaxed text-emerald-100/80">
              <span className="font-semibold text-emerald-100">Password updated.</span> Sign in with your new
              credentials — your old sessions are no longer valid.
            </p>
          </div>
          <Button size="lg" className="w-full" onClick={() => router.replace("/login")}>
            Continue to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-7 space-y-5">
          <Field label="Reset token" error={errors.token?.message} htmlFor="token">
            <TextInput id="token" placeholder="Paste the token from your email" icon={<KeyRound className="h-4 w-4" />} invalid={Boolean(errors.token)} className="font-mono text-[12.5px]" {...register("token")} />
          </Field>

          <Field label="New password" error={errors.password?.message} htmlFor="new-password">
            <TextInput id="new-password" type="password" autoComplete="new-password" placeholder="8+ characters" icon={<Lock className="h-4 w-4" />} invalid={Boolean(errors.password)} {...register("password")} />
          </Field>

          <Field label="Confirm new password" error={errors.confirmPassword?.message} htmlFor="confirm-new-password">
            <TextInput id="confirm-new-password" type="password" autoComplete="new-password" placeholder="Repeat the new password" icon={<Lock className="h-4 w-4" />} invalid={Boolean(errors.confirmPassword)} {...register("confirmPassword")} />
          </Field>

          {rootError ? (
            <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-200">
              {rootError}
            </p>
          ) : null}

          <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
            Update password
          </Button>
        </form>
      )}
    </div>
  );
}
