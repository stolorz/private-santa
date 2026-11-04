import { redirect } from "next/navigation";
import { hasRegisteredUser } from "@/lib/session";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  if (await hasRegisteredUser()) redirect("/login");
  return <SignupForm />;
}
