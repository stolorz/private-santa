import { ResetPasswordForm } from "./reset-password-form";

type ResetQuery = {
  token?: string | string[];
  error?: string | string[];
};

export function firstQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<ResetQuery>;
}) {
  const query = await searchParams;
  return (
    <ResetPasswordForm
      token={firstQuery(query.token)}
      errorCode={firstQuery(query.error)}
    />
  );
}
