"use client";

import type { GuestDraft } from "@/components/guests/guest-editor/use-guest-draft";
import { GenderSelect } from "@/components/inputs/gender-select";
import { LanguageSelect } from "@/components/inputs/language-select";
import { NameCaseInputs } from "@/components/inputs/name-case-inputs";
import { PhoneInput } from "@/components/inputs/phone-input";
import { Input } from "@/components/ui/input";
import type { DirtyGuestFields } from "@/lib/guest-draft";

export function GuestFields({
  idPrefix,
  draft,
  autoFocus,
  disabled,
  nameDisabled,
  contactDisabled,
  onNameChange,
  onNameBlur,
  dirty,
}: {
  idPrefix: string;
  draft: GuestDraft;
  autoFocus?: boolean;
  disabled?: boolean;
  nameDisabled?: boolean;
  contactDisabled?: boolean;
  onNameChange?: (value: string) => void;
  onNameBlur?: (value: string) => void;
  dirty?: DirtyGuestFields;
}) {
  return (
    <>
      <Input
        id={`${idPrefix}-name`}
        name="name"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label="Name"
        placeholder="Name"
        value={draft.name}
        onChange={(e) =>
          onNameChange ? onNameChange(e.target.value) : draft.setName(e.target.value)
        }
        onBlur={(e) => onNameBlur?.(e.target.value)}
        required
        disabled={disabled || nameDisabled}
        dirty={dirty?.name}
      />
      <LanguageSelect
        value={draft.language}
        onChange={draft.setLanguage}
        disabled={disabled}
        dirty={dirty?.language}
      />
      <PhoneInput
        value={draft.phone}
        onChange={draft.setPhone}
        placeholder="Phone"
        disabled={disabled || contactDisabled}
        dirty={dirty?.phone}
      />
      <Input
        id={`${idPrefix}-email`}
        type="email"
        aria-label="Email"
        placeholder="Email"
        value={draft.email}
        onChange={(e) => draft.setEmail(e.target.value)}
        disabled={disabled || contactDisabled}
        dirty={dirty?.email}
      />
      <GenderSelect
        value={draft.gender}
        onChange={draft.setGender}
        disabled={disabled}
        dirty={dirty?.gender}
      />
      <NameCaseInputs
        idPrefix={idPrefix}
        values={draft.cases}
        onChange={draft.setCase}
        disabled={disabled}
        dirty={dirty?.cases}
      />
    </>
  );
}
