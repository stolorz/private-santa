"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMutation } from "@/hooks/use-mutation";
import type { AuthSecretStatus } from "@/lib/auth-secret-types";
import { requestJson } from "@/lib/fetch-json";
import { apiPath } from "@/lib/public-path";

function statusCopy(status: AuthSecretStatus): string {
  if (status.source === "default") {
    return "Using Better Auth's built-in default. Set a random secret before deploying.";
  }
  return `Currently using ${status.source}.`;
}

export function SafetySettings({ initial }: { initial: AuthSecretStatus }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const rotate = useMutation(() =>
    requestJson<AuthSecretStatus & { ok: true }>(apiPath("/api/settings/safety"), {
      method: "POST",
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auth secret</CardTitle>
        <CardDescription>
          Better Auth signs organiser sessions with{" "}
          <code>BETTER_AUTH_SECRET</code>, or <code>AUTH_SECRET</code> if that
          is unset. The secret never appears here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{statusCopy(initial)}</p>
        {initial.weak ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            This value is the example placeholder, the built-in default, or
            too short. Generate a new one.
          </p>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          onClick={() => setConfirming(true)}
        >
          Generate new secret
        </Button>
        <ConfirmDialog
          open={confirming}
          title="Generate a new auth secret?"
          description="Generating a new secret will sign you out and wipe all organiser login sessions. Guest reveal links are not affected."
          confirmLabel="Generate and sign out"
          tone="destructive"
          busy={rotate.busy}
          error={rotate.error}
          onCancel={() => {
            if (rotate.busy) return;
            setConfirming(false);
            rotate.reset();
          }}
          onConfirm={() => {
            void rotate.run(undefined).then((result) => {
              if (!result.ok) return;
              setConfirming(false);
              router.push("/login");
              router.refresh();
            });
          }}
        />
      </CardContent>
    </Card>
  );
}
