"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/contexts/toast-context";
import { ApiClientError } from "@/lib/api/client";
import { authErrorMessage } from "@/lib/api/error-messages";
import { registerFormSchema, type RegisterFormValues } from "@/lib/schemas";

function passwordScore(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

const SCORE_LABEL = ["Too weak", "Weak", "Fair", "Good", "Strong", "Excellent"];
const SCORE_COLOR = ["bg-rose-400", "bg-rose-400", "bg-amber-400", "bg-amber-300", "bg-emerald-400", "bg-emerald-300"];

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const toast = useToast();
  const [rootError, setRootError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "", confirmPassword: "", acceptTerms: false },
  });

  const password = watch("password") ?? "";
  const score = passwordScore(password);

  const onSubmit = handleSubmit(async (values) => {
    setRootError(null);
    try {
      const user = await registerUser({ ...values, acceptTerms: true as const });
      toast.success(`Welcome to Fast Wallet, ${user.firstName}`, "Your account is ready. Add funds from the dashboard.");
      router.replace("/dashboard");
    } catch (e) {
      // Server-side validation is the source of truth: put each message on its
      // field instead of a generic banner that points at nothing.
      if (e instanceof ApiClientError && e.code === "VALIDATION_ERROR" && e.details?.fieldErrors) {
        let mapped = false;
        for (const [field, messages] of Object.entries(e.details.fieldErrors)) {
          if (field in values && messages?.[0]) {
            setError(field as keyof RegisterFormValues, { type: "server", message: messages[0] });
            mapped = true;
          }
        }
        setRootError(mapped ? "Please correct the highlighted fields and try again." : e.message);
        return;
      }
      setRootError(authErrorMessage(e));
    }
  });

  return (
    <div>
      <h1 className="font-display text-[30px] font-bold tracking-tight">Create your account</h1>
      <p className="mt-2 text-[14px] text-zinc-400">
        Your Fast Wallet starts at zero — funds arrive only after verified payments.{" "}
        <Link href="/login" className="font-semibold text-emerald-300 transition hover:text-emerald-200">
          Sign in instead
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" error={errors.firstName?.message} htmlFor="firstName">
            <TextInput id="firstName" placeholder="Ada" autoComplete="given-name" invalid={Boolean(errors.firstName)} {...register("firstName")} />
          </Field>
          <Field label="Last name" error={errors.lastName?.message} htmlFor="lastName">
            <TextInput id="lastName" placeholder="Lovelace" autoComplete="family-name" invalid={Boolean(errors.lastName)} {...register("lastName")} />
          </Field>
        </div>

        <Field label="Email address" error={errors.email?.message} htmlFor="reg-email">
          <TextInput id="reg-email" type="email" autoComplete="email" placeholder="you@example.com" icon={<Mail className="h-4 w-4" />} invalid={Boolean(errors.email)} {...register("email")} />
        </Field>

        <Field label="Password" error={errors.password?.message} htmlFor="reg-password">
          <TextInput id="reg-password" type="password" autoComplete="new-password" placeholder="8+ characters" icon={<Lock className="h-4 w-4" />} invalid={Boolean(errors.password)} {...register("password")} />
          {password.length > 0 ? (
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < score ? SCORE_COLOR[score] : "bg-white/10"}`} />
                ))}
              </div>
              <span className="text-[11px] font-medium text-zinc-400">{SCORE_LABEL[score]}</span>
            </div>
          ) : null}
        </Field>

        <Field label="Confirm password" error={errors.confirmPassword?.message} htmlFor="confirmPassword">
          <TextInput id="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat your password" icon={<Lock className="h-4 w-4" />} invalid={Boolean(errors.confirmPassword)} {...register("confirmPassword")} />
        </Field>

        <div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 transition hover:border-white/20">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-white/5 accent-emerald-400"
              {...register("acceptTerms")}
            />
            <span className="text-[12.5px] leading-relaxed text-zinc-400">
              I agree to the <span className="font-semibold text-zinc-200">Fast Wallet Terms of Service</span> and confirm the
              details I provided are accurate.
            </span>
          </label>
          {errors.acceptTerms ? (
            <p className="mt-1.5 text-[12.5px] font-medium text-rose-300">{errors.acceptTerms.message}</p>
          ) : null}
        </div>

        {rootError ? (
          <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3.5 py-2.5 text-[13px] font-medium text-rose-200">
            {rootError}
          </p>
        ) : null}

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          <ShieldCheck className="h-4 w-4" />
          Create account
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
