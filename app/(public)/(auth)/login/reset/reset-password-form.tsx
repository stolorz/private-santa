"use client";
import { useState } from "react";
import Link from "next/link";
import { resetPassword } from "@/lib/auth-client";
import { authClientErrorMessage } from "@/lib/auth-email";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CenteredCard } from "@/components/layout/page-shell";
import { useMutation } from "@/hooks/use-mutation";

const INVALID_LINK = "This reset link is invalid or has expired.";

export function ResetPasswordForm({
  token,
  errorCode,
}: {
  token: string;
  errorCode: string;
}) {
  const resetToken = token.trim();
  const linkBroken = !resetToken || Boolean(errorCode.trim());
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [updated, setUpdated] = useState(false);
  const mismatch = confirm.length > 0 && password !== confirm;
  const { run, busy, error, setError } = useMutation(
    async (input: { newPassword: string; token: string }) => {
      const { error: resetError } = await resetPassword(input);
      if (resetError) {
        const message = authClientErrorMessage(
          resetError,
          "Could not update the password.",
        );
        return {
          ok: false as const,
          data: null,
          error: message === "Invalid token" ? INVALID_LINK : message,
          status: 400,
        };
      }
      return { ok: true as const, data: null, error: null, status: 200 };
    },
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return;
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    const result = await run({ newPassword: password, token: resetToken });
    if (result.ok) setUpdated(true);
  }

  if (linkBroken) {
    return (
      <CenteredCard
        title="Reset link"
        description={INVALID_LINK}
        brand={false}
      >
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login/forgot" className="underline">
            Request another
          </Link>
        </p>
      </CenteredCard>
    );
  }

  if (updated) {
    return (
      <CenteredCard
        title="Password updated"
        description="You can log in with the new password."
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
      title="Choose a new password"
      description="This replaces the password on your organiser account."
      brand={false}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field id="password" label="New password" hint="At least 8 characters.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field id="confirm-password" label="Confirm password">
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {mismatch && (
          <p className="text-sm text-destructive">
            Those passwords do not match.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="xl" disabled={busy || mismatch}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </CenteredCard>
  );
}
