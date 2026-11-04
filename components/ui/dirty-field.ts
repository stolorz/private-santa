/** Unsaved-field chrome. Stays after blur until save or revert. */
export const dirtyFieldClass =
  "border-orange-500 ring-2 ring-orange-400/80 dark:border-orange-400 dark:ring-orange-400/80 focus:ring-2 focus:ring-orange-400/80 focus-visible:ring-2 focus-visible:ring-orange-400/80 focus-within:ring-2 focus-within:ring-orange-400/80";

/** Invalid-field chrome. Wins over the unsaved ring when both apply. */
export const invalidFieldClass =
  "border-destructive ring-2 ring-destructive/80 dark:border-destructive dark:ring-destructive/80 focus:ring-2 focus:ring-destructive/80 focus-visible:ring-2 focus-visible:ring-destructive/80 focus-within:ring-2 focus-within:ring-destructive/80";
