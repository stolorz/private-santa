"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  OPTIONAL_NAME_CASE_FIELDS,
  type NameCaseFormValues,
  type OptionalNameCaseField,
} from "@/lib/name-cases";

export function NameCaseInputs({
  idPrefix,
  values,
  onChange,
  disabled,
  required = true,
  className,
  dirty,
}: {
  idPrefix: string;
  values: NameCaseFormValues;
  onChange: (field: OptionalNameCaseField, value: string) => void;
  disabled?: boolean;
  /** Blank cases are invalid when this is set. Event and guest saves both require them. */
  required?: boolean;
  className?: string;
  dirty?: Partial<Record<OptionalNameCaseField, boolean>>;
}) {
  return (
    <div
      className={cn("grid gap-2 sm:col-span-2 sm:grid-cols-2", className)}
    >
      {OPTIONAL_NAME_CASE_FIELDS.map(({ field, label, hint }) => (
        <div key={field} className="space-y-1">
          <Label
            htmlFor={`${idPrefix}-${field}`}
            className="text-xs text-muted-foreground"
          >
            {label}
            <span className="font-normal"> · {hint}</span>
          </Label>
          <Input
            id={`${idPrefix}-${field}`}
            name={field}
            autoComplete="off"
            aria-label={`${label}, ${hint}`}
            placeholder={hint}
            value={values[field]}
            onChange={(e) => onChange(field, e.target.value)}
            required={required}
            aria-invalid={
              required && values[field].trim() === "" ? true : undefined
            }
            disabled={disabled}
            dirty={dirty?.[field]}
          />
        </div>
      ))}
    </div>
  );
}
