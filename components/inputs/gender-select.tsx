"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GENDERS, isGender, type Gender } from "@/lib/gender";

export function GenderSelect({
  value,
  onChange,
  disabled,
  dirty,
  className,
}: {
  value: Gender | null;
  onChange: (value: Gender) => void;
  disabled?: boolean;
  dirty?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(next) => {
        if (isGender(next)) onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label="Gender"
        aria-invalid={value == null}
        dirty={dirty}
        className={className}
      >
        <SelectValue placeholder="Gender" />
      </SelectTrigger>
      <SelectContent>
        {GENDERS.map((gender) => (
          <SelectItem key={gender.code} value={gender.code}>
            {gender.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
