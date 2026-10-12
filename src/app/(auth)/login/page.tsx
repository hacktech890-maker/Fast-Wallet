"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/contexts/toast-context";
import { authErrorMessage } from "@/lib/api/error-messages";
import { loginFormSchema, type LoginFormValues } from "@/lib/schemas";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const toast = useToast();
  const [rootError, setRootError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setRootError(null);
    try {
      const user = await login(values);
      toast.success(`Welcome back, ${user.firstName}`);
      // Same-origin relative paths only — never an open redirect to another
      // host/protocol (e.g. "//evil.com").
      const next = new URLSearchParams(window.location.search).get("next");
      const safe = typeof next === "string" && /^\/(?!\/)/.test(next) ? next : "/dashboard";
      router.replace(safe);
    } catch (e) {
      setRootError(authErrorMessage(e));
    }
  });

  return (
    <div>
      <h1 className="font-display text-[30px] font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-[14px] text-zinc-400">
        Sign in to your Fast Wallet account.{" "}
        <Link href="/register" className="font-semibold text-emerald-300 transition hover:text-emerald-200">
          Create an account
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-5">
        <Field label="Email address" error={errors.email?.message} htmlFor="email">
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            icon={<Mail className="h-4 w-4" />}
            invalid={Boolean(errors.email)}
            {...register("email")}
          />
        </Field>

        <Field label="Password" error={errors.password?.message} htmlFor="password">
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            icon={<Lock className="h-4 w-4" />}
            invalid={Boolean(errors.password)}
            {...register("password")}
          />
        </Field>

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-[13px] font-medium text-zinc-400 transition hover:text-emerald-300">
            Forgot password?
          </Link>
        </div>

        {rootError ? (
          <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-200">
            {rootError}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Sign in
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-8 text-center text-[12px] leading-relaxed text-zinc-600">
        Sessions use secure HTTP-only cookies. Logins are rate-limited and recorded in the audit log.
      </p>
    </div>
  );
}
