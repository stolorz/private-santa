import { redirect } from "next/navigation";
import { hasRegisteredUser } from "@/lib/session";
import { SignupForm } from "./signup-form";

// The organiser check reads the live database. A static build would freeze
// the laptop's answer into .next and send production to /login.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await hasRegisteredUser()) redirect("/login");
  return <SignupForm />;
}
