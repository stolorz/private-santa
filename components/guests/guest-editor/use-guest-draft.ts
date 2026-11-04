"use client";

import { useState } from "react";
import { type Gender } from "@/lib/gender";
import {
  dirtyGuestFields,
  emptyGuestDraftSource,
  guestFieldsAreDirty,
  type GuestDraftSource,
} from "@/lib/guest-draft";
import { DEFAULT_LANGUAGE } from "@/lib/language";
import {
  emptyNameCaseForm,
  nameCaseFormFrom,
  optionalNameCasesFromBody,
  type NameCaseFormValues,
  type OptionalNameCaseField,
} from "@/lib/name-cases";

export type { GuestDraftSource };

export function useGuestDraft() {
  const [name, setName] = useState("");
  const [cases, setCases] = useState<NameCaseFormValues>(emptyNameCaseForm);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [gender, setGender] = useState<Gender | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function snapshot() {
    return { name, phone, email, language, gender, cases };
  }

  function fillFrom(person: GuestDraftSource) {
    setName(person.name);
    setCases(nameCaseFormFrom(person));
    setPhone(person.phone ?? "");
    setEmail(person.email ?? "");
    setLanguage(person.language);
    setGender(person.gender);
  }

  function reset() {
    setName("");
    setCases(emptyNameCaseForm());
    setPhone("");
    setEmail("");
    setLanguage(DEFAULT_LANGUAGE);
    setGender(null);
    setPhoto(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
  }

  function pickPhoto(file: File) {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPhoto(file);
  }

  function setCase(field: OptionalNameCaseField, value: string) {
    setCases((prev) => ({ ...prev, [field]: value }));
  }

  function dirtyFields(person: GuestDraftSource) {
    return dirtyGuestFields(snapshot(), person);
  }

  function isDirty(person: GuestDraftSource) {
    return guestFieldsAreDirty(dirtyFields(person));
  }

  function toBody() {
    return {
      name,
      phone: phone || null,
      email: email || null,
      language,
      gender,
      ...optionalNameCasesFromBody(cases),
    };
  }

  return {
    name,
    setName,
    cases,
    setCases,
    setCase,
    phone,
    setPhone,
    email,
    setEmail,
    language,
    setLanguage,
    gender,
    setGender,
    photo,
    photoPreview,
    pickPhoto,
    busy,
    setBusy,
    error,
    setError,
    fillFrom,
    reset,
    dirtyFields,
    isDirty,
    toBody,
  };
}

export type GuestDraft = ReturnType<typeof useGuestDraft>;

export { emptyGuestDraftSource };
