"use client";
import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth-client";
import { authClientErrorMessage } from "@/lib/auth-email";
import { appBasePath } from "@/lib/public-path";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CenteredCard } from "@/components/layout/page-shell";
import { useMutation } from "@/hooks/use-mutation";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { run, busy, error } = useMutation(async (address: string) => {
    const { error: resetError } = await requestPasswordReset({
      email: address,
      redirectTo: `${appBasePath()}/login/reset`,
    });
    if (resetError) {
      return {
        ok: false as const,
        data: null,
        error: authClientErrorMessage(
          resetError,
          "Could not send a reset link.",
        ),
        status: 400,
      };
    }
    return { ok: true as const, data: null, error: null, status: 200 };
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await run(email.trim());
    if (result.ok) setSent(true);
  }

  if (sent) {
    return (
      <CenteredCard
        title="Check your email"
        description="If an account exists for that address, we sent a link to choose a new password. It expires in one hour."
        brand={false}
      >
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard
      title="Forgot password"
      description="Enter the email on your organiser account."
      brand={false}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field id="email" label="Email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="xl" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </form>
    </CenteredCard>
  );
}
