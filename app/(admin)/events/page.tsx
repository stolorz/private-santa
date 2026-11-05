import Link from "next/link";
import { redirect } from "next/navigation";
import { Gift } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { visibleSeriesFor } from "@/lib/events";
import { EventsManager } from "@/components/events/events-manager";
import { PageShell } from "@/components/layout/page-shell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Button } from "@/components/ui/button";

export default async function EventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const admin = user.role === "admin";
  const groups = admin ? await visibleSeriesFor(user) : [];
  const editions = groups.flatMap((g) => g.editions);

  return (
    <PageShell>
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <SignOutButton />
          <Gift className="size-6 shrink-0 text-berry" />
          <h1 className="min-w-0 truncate font-heading text-xl font-semibold text-primary">
            {admin ? "Your events" : "Private Santa"}
          </h1>
        </div>
        {admin ? (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/settings">Settings</Link>
          </Button>
        ) : null}
      </header>

      {!admin ? (
        <p className="text-sm text-muted-foreground">
          Guests don&apos;t log in. Open the private link the organiser sent
          you after the draw.
        </p>
      ) : editions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events yet.</p>
      ) : null}

      {admin && <EventsManager groups={groups} />}
    </PageShell>
  );
}
