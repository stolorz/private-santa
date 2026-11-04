export type AuthSecretSource =
  | "BETTER_AUTH_SECRET"
  | "AUTH_SECRET"
  | "default";

export type AuthSecretStatus = {
  source: AuthSecretSource;
  weak: boolean;
};
