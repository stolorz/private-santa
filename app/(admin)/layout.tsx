import type { ReactNode } from "react";
import { FestiveAtmosphere } from "@/components/festive/festive-atmosphere";

export default function AdminGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <FestiveAtmosphere />
      <div className="relative z-10">{children}</div>
    </>
  );
}
