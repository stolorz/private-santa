import { z } from "zod";
import {
  BUDGET_AMOUNT_REQUIRED_MESSAGE,
  BUDGET_KINDS,
  budgetAmountsEqual,
  CURRENCIES,
  MISSING_BUDGET_CHOICE_MESSAGE,
  ZERO_IS_NOT_A_BUDGET_MESSAGE,
} from "@/lib/budget";
import { missingEventDateMessage } from "@/lib/event-date";
import { isValidOccursOn } from "@/lib/occurs-on";
import { GENDER_REQUIRED_MESSAGE, isGender } from "@/lib/gender";
import { normalizeGuestEmail, normalizeGuestPhone } from "@/lib/guest-contact";
import { LANGUAGE_CODES } from "@/lib/language";
import {
  missingPolishCasesMessage,
  optionalNameCaseZodFields,
  type OptionalNameCaseField,
} from "@/lib/name-cases";
import {
  TEMPLATE_IDS,
  TEMPLATE_LANGUAGES,
  type TemplateId,
  type TemplateLanguage,
  type TemplatesPatch,
} from "@/lib/templates/fields";

export const occursOnSchema = z
  .string()
  .refine(isValidOccursOn, { message: "Date must be YYYY-MM-DD." });

/** Optional on a partial patch. Blank, whitespace, and null are a missing date. */
const eventPatchOccursOnSchema = z
  .union([z.string(), z.null()])
  .transform((value, ctx): string => {
    if (value == null || value.trim() === "") {
      ctx.addIssue({
        code: "custom",
        message: missingEventDateMessage(value)!,
      });
      return z.NEVER;
    }
    if (!isValidOccursOn(value)) {
      ctx.addIssue({ code: "custom", message: "Date must be YYYY-MM-DD." });
      return z.NEVER;
    }
    return value;
  })
  .optional();

export const optionalPhoneSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    const phone = normalizeGuestPhone(value);
    if (value && !phone) {
      ctx.addIssue({ code: "custom", message: "Invalid phone number." });
      return z.NEVER;
    }
    return phone;
  });

const optionalEmailSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (!value) return null;
    const email = normalizeGuestEmail(value);
    if (!email || !z.email().safeParse(email).success) {
      ctx.addIssue({ code: "custom", message: "Invalid email address." });
      return z.NEVER;
    }
    return email;
  });

export const contactSchema = z.object({
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
});

export type ParsedContact = z.infer<typeof contactSchema>;

export const personFieldsObject = z.object({
  name: z.string().min(1).optional(),
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  language: z.enum(LANGUAGE_CODES).optional(),
  gender: z.union([z.string(), z.null()]).optional(),
  ...optionalNameCaseZodFields(z.string().optional().nullable()),
});

export function withRequiredPolishCases<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data, ctx) => {
    const row = data as {
      gender?: string | null;
    } & Partial<Record<OptionalNameCaseField, string | null | undefined>>;
    if (!row.gender || !isGender(row.gender)) {
      ctx.addIssue({
        code: "custom",
        message: GENDER_REQUIRED_MESSAGE,
        path: ["gender"],
      });
    }
    const message = missingPolishCasesMessage(row);
    if (message) ctx.addIssue({ code: "custom", message });
  });
}

export const personFieldsSchema = withRequiredPolishCases(personFieldsObject);

export type PersonFields = z.infer<typeof personFieldsSchema>;

const extraAmountSchema = z.number().nonnegative().nullable().optional();

export const eventPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    nameEn: z.string().optional().nullable(),
    nameDe: z.string().optional().nullable(),
    nameEs: z.string().optional().nullable(),
    nameJa: z.string().optional().nullable(),
    namePl: z.string().optional().nullable(),
    occursOn: eventPatchOccursOnSchema,
    location: z.string().optional().nullable(),
    locationGdzie: z.string().optional().nullable(),
    budgetKind: z.enum(BUDGET_KINDS).nullable().optional(),
    budget: z.number().nonnegative().nullable().optional(),
    currency: z.enum(CURRENCIES).optional(),
    budgetEur: extraAmountSchema,
    budgetPln: extraAmountSchema,
    budgetJpy: extraAmountSchema,
    ...optionalNameCaseZodFields(z.string().optional().nullable()),
  })
  .superRefine((data, ctx) => {
    const extras = {
      EUR: data.budgetEur,
      PLN: data.budgetPln,
      JPY: data.budgetJpy,
    };
    const extrasTouched = Object.values(extras).some((value) => value !== undefined);

    if (data.budgetKind === null) {
      ctx.addIssue({
        code: "custom",
        message: MISSING_BUDGET_CHOICE_MESSAGE,
        path: ["budgetKind"],
      });
      return;
    }

    if (data.budget === 0 && data.budgetKind !== "zero" && data.budgetKind !== "unlimited") {
      ctx.addIssue({
        code: "custom",
        message: ZERO_IS_NOT_A_BUDGET_MESSAGE,
        path: ["budget"],
      });
      return;
    }

    if (data.budgetKind === "zero" || data.budgetKind === "unlimited") {
      if (data.budget != null) {
        ctx.addIssue({
          code: "custom",
          message: "Clear the budget amount for this choice.",
          path: ["budget"],
        });
      }
      for (const [code, value] of Object.entries(extras)) {
        if (value != null) {
          ctx.addIssue({
            code: "custom",
            message: "Clear all budget amounts together.",
            path: [
              code === "EUR"
                ? "budgetEur"
                : code === "PLN"
                  ? "budgetPln"
                  : "budgetJpy",
            ],
          });
        }
      }
      return;
    }

    if (data.budgetKind === "amount" && data.budget == null) {
      ctx.addIssue({
        code: "custom",
        message: BUDGET_AMOUNT_REQUIRED_MESSAGE,
        path: ["budget"],
      });
      return;
    }

    if (data.budget === undefined) {
      if (extrasTouched) {
        ctx.addIssue({
          code: "custom",
          message: "Budget amounts must be sent together.",
          path: ["budget"],
        });
      }
      return;
    }

    if (data.budget === null) {
      for (const [code, value] of Object.entries(extras)) {
        if (value != null) {
          ctx.addIssue({
            code: "custom",
            message: "Clear all budget amounts together.",
            path: [
              code === "EUR"
                ? "budgetEur"
                : code === "PLN"
                  ? "budgetPln"
                  : "budgetJpy",
            ],
          });
        }
      }
      return;
    }

    if (data.currency === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Currency is required when setting a budget.",
        path: ["currency"],
      });
      return;
    }
    if (data.budgetEur == null || data.budgetPln == null || data.budgetJpy == null) {
      ctx.addIssue({
        code: "custom",
        message: "EUR, PLN, and JPY amounts are required.",
        path: ["budget"],
      });
      return;
    }
    const matching = extras[data.currency];
    if (matching == null || !budgetAmountsEqual(matching, data.budget)) {
      ctx.addIssue({
        code: "custom",
        message: "Primary budget must match its currency amount.",
        path: ["budget"],
      });
    }
  });

export type EventPatch = z.infer<typeof eventPatchSchema>;

export const eventDeleteSchema = z.object({
  deletePersonIds: z.array(z.number().int().positive()).optional().default([]),
});

const templateFieldsSchema = z
  .object(
    Object.fromEntries(TEMPLATE_IDS.map((id) => [id, z.string().optional()])),
  )
  .strict();

export const templatesPatchSchema = z
  .object(
    Object.fromEntries(
      TEMPLATE_LANGUAGES.map((lang) => [lang, templateFieldsSchema.optional()]),
    ),
  )
  .transform((data): TemplatesPatch => {
    const patch: TemplatesPatch = {};
    for (const lang of TEMPLATE_LANGUAGES) {
      const fields = data[lang] as Partial<Record<TemplateId, string>> | undefined;
      if (!fields) continue;
      const next: Partial<Record<TemplateId, string>> = {};
      for (const id of TEMPLATE_IDS) {
        const value = fields[id];
        if (typeof value === "string") next[id] = value;
      }
      patch[lang as TemplateLanguage] = next;
    }
    return patch;
  });
