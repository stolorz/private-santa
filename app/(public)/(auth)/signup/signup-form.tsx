"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CenteredCard } from "@/components/layout/page-shell";
import { jsonBody, requestJson } from "@/lib/fetch-json";
import { useMutation } from "@/hooks/use-mutation";
import { apiPath } from "@/lib/public-path";

type SignupResponse = { ok: true; needsVerification: boolean };

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const { run, busy, error } = useMutation((body: {
    name: string;
    email: string;
    password: string;
  }) =>
    requestJson<SignupResponse>(apiPath("/api/signup"), {
      method: "POST",
      ...jsonBody(body),
    }),
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await run({ name, email, password });
    if (!result.ok) return;
    if (result.data.needsVerification) {
      setNeedsVerification(true);
      return;
    }
    router.push("/events");
    router.refresh();
  }

  if (needsVerification) {
    return (
      <CenteredCard
        title="Check your email"
        description="We sent a confirmation link. Open it, then log in."
      >
        <p className="text-center text-sm text-muted-foreground">
          Already confirmed?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard
      title="Create organiser account"
      description="The first account runs events. Guests never sign up — they get a private link after the draw."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field id="name" label="Name">
          <Input
            id="name"
            name="name"
            autoComplete="off"
            placeholder="Ada"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="xl" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already the organiser?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </form>
    </CenteredCard>
  );
}
