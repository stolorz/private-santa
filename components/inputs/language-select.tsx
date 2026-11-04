"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES } from "@/lib/language";
import { cn } from "@/lib/utils";

function LanguageFlag({ iso2 }: { iso2: string }) {
  return (
    <span
      className={cn("fi shrink-0 rounded-[2px]", `fi-${iso2}`)}
      aria-hidden
    />
  );
}

function LanguageOption({
  iso2,
  label,
}: {
  iso2: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <LanguageFlag iso2={iso2} />
      {label}
    </span>
  );
}

export function LanguageSelect({
  value,
  onChange,
  disabled,
  dirty,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  dirty?: boolean;
  className?: string;
}) {
  const selected = LANGUAGES.find((lang) => lang.code === value);
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label="Language" dirty={dirty} className={className}>
        <SelectValue>
          {selected ? (
            <LanguageOption iso2={selected.iso2} label={selected.label} />
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code} textValue={lang.label}>
            <LanguageOption iso2={lang.iso2} label={lang.label} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
