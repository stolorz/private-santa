import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { WinterCard, WinterPage } from "@/components/festive/winter-page";
import { getCurrentUser, hasRegisteredUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/events");

  const hasOrganiser = await hasRegisteredUser();

  return (
    <WinterPage
      title="Private Santa"
      subtitle="Draw names, share wishlists, keep the secret."
      brand={false}
    >
      <WinterCard>
        <CardContent className="flex flex-col gap-3 px-6 pt-7 pb-7 sm:px-8">
          <p className="mb-2 text-center text-sm text-balance text-muted-foreground">
            {hasOrganiser
              ? "Guests use the private link the organiser sends after the draw. Organisers log in here."
              : "Create the organiser account, add guests, and run a draw. Each guest gets a private link — no signup needed."}
          </p>
          {hasOrganiser ? (
            <Button asChild size="xl">
              <Link href="/login">
                <LogIn aria-hidden="true" />
                Organiser log in
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="xl">
                <Link href="/signup">
                  <UserPlus aria-hidden="true" />
                  Create organiser account
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <Link href="/login">
                  <LogIn aria-hidden="true" />
                  Log in
                </Link>
              </Button>
            </>
          )}
        </CardContent>
      </WinterCard>
    </WinterPage>
  );
}
