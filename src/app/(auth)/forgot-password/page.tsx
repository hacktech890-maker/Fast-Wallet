"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Mail, MailCheck, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { CopyField } from "@/components/ui/copy-field";
import { authApi } from "@/lib/api/auth.api";
import { ApiClientError } from "@/lib/api/client";
import type { ForgotPasswordResponse } from "@/lib/types";
import { forgotFormSchema, type ForgotFormValues } from "@/lib/schemas";

export default function ForgotPasswordPage() {
  const [result, setResult] = useState<ForgotPasswordResponse | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormValues>({ resolver: zodResolver(forgotFormSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setRootError(null);
    try {
      setResult(await authApi.forgotPassword(values.email));
    } catch (e) {
      setRootError(e instanceof ApiClientError ? e.message : "Cannot reach the server. Please retry.");
    }
  });

  return (
    <div>
      <Link href="/login" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-400 transition hover:text-emerald-300">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to sign in
      </Link>

      <h1 className="mt-5 font-display text-[30px] font-bold tracking-tight">Reset your password</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">
        Enter the email tied to your account. If the account exists, a time-limited reset token is issued.
      </p>

      {result ? (
        <div className="mt-7 space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.07] p-4">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <div>
              <p className="text-[14px] font-semibold text-emerald-100">Check your inbox</p>
              <p className="mt-1 text-[13px] leading-relaxed text-emerald-100/70">{result.message}</p>
            </div>
          </div>

          {result.devResetToken ? (
            <div className="space-y-3 rounded-2xl border border-amber-300/25 bg-amber-400/[0.06] p-4">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-amber-200">
                <FlaskConical className="h-4 w-4" />
                Development mode (no email provider configured)
              </p>
              <p className="text-[12px] leading-relaxed text-amber-100/70">
                This token is only shown when NODE_ENV is not production. It expires in {result.expiresInMinutes} minutes.
              </p>
              <CopyField value={result.devResetToken} display={result.devResetToken} />
              <Link href={`/reset-password?token=${encodeURIComponent(result.devResetToken)}`}>
                <Button variant="outline" className="w-full">
                  Open reset page with token
                </Button>
              </Link>
            </div>
          ) : null}

          <button onClick={() => setResult(null)} className="text-[13px] font-medium text-zinc-400 transition hover:text-zinc-200">
            Try a different email
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-7 space-y-5">
          <Field label="Email address" error={errors.email?.message} htmlFor="email">
            <TextInput id="email" type="email" autoComplete="email" placeholder="you@example.com" icon={<Mail className="h-4 w-4" />} invalid={Boolean(errors.email)} {...register("email")} />
          </Field>

          {rootError ? (
            <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-200">
              {rootError}
            </p>
          ) : null}

          <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
            Issue reset token
          </Button>
          <p className="sr-only">{getValues("email")}</p>
        </form>
      )}
    </div>
  );
}
