"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import {
  isUnverifiedEmailError,
  UNVERIFIED_EMAIL_LOGIN_MESSAGE,
} from "@/lib/auth-email";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CenteredCard } from "@/components/layout/page-shell";
import { useMutation } from "@/hooks/use-mutation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { run, busy, error } = useMutation(
    async (creds: { email: string; password: string }) => {
      const { error: signInError } = await signIn.email(creds);
      if (signInError) {
        return {
          ok: false as const,
          data: null,
          error: isUnverifiedEmailError(signInError)
            ? UNVERIFIED_EMAIL_LOGIN_MESSAGE
            : (signInError.message ?? "Login failed."),
          status: 401,
        };
      }
      return { ok: true as const, data: null, error: null, status: 200 };
    },
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await run({ email, password });
    if (!result.ok) return;
    router.push("/events");
    router.refresh();
  }

  return (
    <CenteredCard
      title="Organiser log in"
      description="Guests use the private link from the draw — they don't log in."
      brand={false}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field id="email" label="Email">
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field id="password" label="Password">
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <p className="text-right text-sm">
          <Link
            href="/login/forgot"
            className="text-muted-foreground underline"
          >
            Forgot password?
          </Link>
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="xl" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </CenteredCard>
  );
}
