import { isLanguage, type Language } from "@/lib/language";
import { isValidOccursOn } from "@/lib/occurs-on";

/** Party-date tokens. Month wording follows the template language. */
export const DATE_PLACEHOLDERS = [
  "date",
  "date_day",
  "date_day_pad",
  "date_month",
  "date_month_pad",
  "date_year",
  "date_month_name",
  "date_month_dopelniacz",
  "date_month_miejscownik",
  "date_month_narzednik",
] as const;

export type DatePlaceholder = (typeof DATE_PLACEHOLDERS)[number];

export const DATE_PLACEHOLDER_LABELS: Record<DatePlaceholder, string> = {
  date: "Party date (e.g. 2 August 2027)",
  date_day: "Day of the month",
  date_day_pad: "Day, two digits",
  date_month: "Month number",
  date_month_pad: "Month number, two digits",
  date_year: "Year",
  date_month_name: "Month name",
  date_month_dopelniacz: "Month name, genitive (24 grudnia)",
  date_month_miejscownik: "Month name, locative (w listopadzie)",
  date_month_narzednik: "Month name, instrumental (z listopadem)",
};

type MonthForms = {
  name: string;
  dopelniacz: string;
  miejscownik: string;
  narzednik: string;
};

/** Nominative, genitive, locative, instrumental. February is adjectival. */
const PL_MONTHS: readonly MonthForms[] = [
  {
    name: "styczeń",
    dopelniacz: "stycznia",
    miejscownik: "styczniu",
    narzednik: "styczniem",
  },
  {
    name: "luty",
    dopelniacz: "lutego",
    miejscownik: "lutym",
    narzednik: "lutym",
  },
  {
    name: "marzec",
    dopelniacz: "marca",
    miejscownik: "marcu",
    narzednik: "marcem",
  },
  {
    name: "kwiecień",
    dopelniacz: "kwietnia",
    miejscownik: "kwietniu",
    narzednik: "kwietniem",
  },
  {
    name: "maj",
    dopelniacz: "maja",
    miejscownik: "maju",
    narzednik: "majem",
  },
  {
    name: "czerwiec",
    dopelniacz: "czerwca",
    miejscownik: "czerwcu",
    narzednik: "czerwcem",
  },
  {
    name: "lipiec",
    dopelniacz: "lipca",
    miejscownik: "lipcu",
    narzednik: "lipcem",
  },
  {
    name: "sierpień",
    dopelniacz: "sierpnia",
    miejscownik: "sierpniu",
    narzednik: "sierpniem",
  },
  {
    name: "wrzesień",
    dopelniacz: "września",
    miejscownik: "wrześniu",
    narzednik: "wrześniem",
  },
  {
    name: "październik",
    dopelniacz: "października",
    miejscownik: "październiku",
    narzednik: "październikiem",
  },
  {
    name: "listopad",
    dopelniacz: "listopada",
    miejscownik: "listopadzie",
    narzednik: "listopadem",
  },
  {
    name: "grudzień",
    dopelniacz: "grudnia",
    miejscownik: "grudniu",
    narzednik: "grudniem",
  },
];

const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const DE_MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

const ES_MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function sameForms(name: string): MonthForms {
  return {
    name,
    dopelniacz: name,
    miejscownik: name,
    narzednik: name,
  };
}

function monthForms(language: Language, monthIndex: number): MonthForms {
  if (language === "pl") return PL_MONTHS[monthIndex];
  if (language === "de") return sameForms(DE_MONTHS[monthIndex]);
  if (language === "es") return sameForms(ES_MONTHS[monthIndex]);
  if (language === "ja") return sameForms(`${monthIndex + 1}月`);
  return sameForms(EN_MONTHS[monthIndex]);
}

function composedDate(
  language: Language,
  day: number,
  year: number,
  monthNumber: number,
  month: MonthForms,
): string {
  if (language === "pl") return `${day} ${month.dopelniacz} ${year}`;
  if (language === "de") return `${day}. ${month.name} ${year}`;
  if (language === "es") return `${day} de ${month.name} de ${year}`;
  if (language === "ja") return `${year}年${monthNumber}月${day}日`;
  return `${day} ${month.name} ${year}`;
}

function dateLanguage(language: string): Language {
  return isLanguage(language) ? language : "en";
}

export const MISSING_EVENT_DATE_MESSAGE =
  "Enter the event date. Guest messages will include it, so these details cannot be saved without one.";

export const MISSING_EVENT_DATE_SEND_REASON =
  "Cannot send invitations because the event has no valid party date. Set the date before sending, because guest messages include it.";

/** Sentence for an edition save whose party date is blank or whitespace. */
export function missingEventDateMessage(
  occursOn: string | null | undefined,
): string | null {
  if (occursOn != null && occursOn.trim() !== "") return null;
  return MISSING_EVENT_DATE_MESSAGE;
}

/**
 * Sentence that blocks invitation send until `occursOn` is a real calendar
 * date. Blank, whitespace, and invalid values are the same failure.
 */
export function missingEventDateSendReason(
  occursOn: string | null | undefined,
): string | null {
  if (occursOn != null && isValidOccursOn(occursOn)) return null;
  return MISSING_EVENT_DATE_SEND_REASON;
}

/**
 * Placeholder values for one party date. An invalid or missing `occursOn`
 * returns no keys, so `{date}` stays in the copy instead of going blank.
 */
export function dateVars(
  occursOn: string | null | undefined,
  language: string,
): Partial<Record<DatePlaceholder, string>> {
  if (!occursOn || !isValidOccursOn(occursOn)) return {};
  const [yearText, monthText, dayText] = occursOn.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const day = Number(dayText);
  const lang = dateLanguage(language);
  const month = monthForms(lang, monthNumber - 1);
  return {
    date: composedDate(lang, day, year, monthNumber, month),
    date_day: String(day),
    date_day_pad: dayText,
    date_month: String(monthNumber),
    date_month_pad: monthText,
    date_year: yearText,
    date_month_name: month.name,
    date_month_dopelniacz: month.dopelniacz,
    date_month_miejscownik: month.miejscownik,
    date_month_narzednik: month.narzednik,
  };
}
