"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PairOption = { id: number; name: string };

export function PairPicker({
  left,
  right,
  onLeftChange,
  onRightChange,
  leftPlaceholder,
  rightPlaceholder,
  leftOptions,
  rightOptions,
  submitLabel,
  disabled,
  submitDisabled,
  isBlocked,
  onSubmit,
}: {
  left: string;
  right: string;
  onLeftChange: (value: string) => void;
  onRightChange: (value: string) => void;
  leftPlaceholder: string;
  rightPlaceholder: string;
  leftOptions: PairOption[];
  rightOptions: PairOption[];
  submitLabel: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  isBlocked: (otherId: string, candidateId: number) => boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
      <Select value={left} onValueChange={onLeftChange} disabled={disabled}>
        <SelectTrigger dirty={left !== ""}>
          <SelectValue placeholder={leftPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {leftOptions.map((option) => (
            <SelectItem
              key={option.id}
              value={String(option.id)}
              disabled={isBlocked(right, option.id)}
            >
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={right} onValueChange={onRightChange} disabled={disabled}>
        <SelectTrigger dirty={right !== ""}>
          <SelectValue placeholder={rightPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {rightOptions.map((option) => (
            <SelectItem
              key={option.id}
              value={String(option.id)}
              disabled={isBlocked(left, option.id)}
            >
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        disabled={
          disabled || submitDisabled || !left || !right || isBlocked(left, Number(right))
        }
      >
        {submitLabel}
      </Button>
    </form>
  );
}
