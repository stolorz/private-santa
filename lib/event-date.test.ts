import { describe, expect, it } from "vitest";
import {
  DATE_PLACEHOLDERS,
  dateVars,
  MISSING_EVENT_DATE_SEND_REASON,
  missingEventDateMessage,
  missingEventDateSendReason,
} from "@/lib/event-date";

const MONTHS = [
  {
    month: 1,
    pl: {
      name: "styczeń",
      dopelniacz: "stycznia",
      miejscownik: "styczniu",
      narzednik: "styczniem",
    },
    en: "January",
    de: "Januar",
    es: "enero",
  },
  {
    month: 2,
    pl: {
      name: "luty",
      dopelniacz: "lutego",
      miejscownik: "lutym",
      narzednik: "lutym",
    },
    en: "February",
    de: "Februar",
    es: "febrero",
  },
  {
    month: 3,
    pl: {
      name: "marzec",
      dopelniacz: "marca",
      miejscownik: "marcu",
      narzednik: "marcem",
    },
    en: "March",
    de: "März",
    es: "marzo",
  },
  {
    month: 4,
    pl: {
      name: "kwiecień",
      dopelniacz: "kwietnia",
      miejscownik: "kwietniu",
      narzednik: "kwietniem",
    },
    en: "April",
    de: "April",
    es: "abril",
  },
  {
    month: 5,
    pl: {
      name: "maj",
      dopelniacz: "maja",
      miejscownik: "maju",
      narzednik: "majem",
    },
    en: "May",
    de: "Mai",
    es: "mayo",
  },
  {
    month: 6,
    pl: {
      name: "czerwiec",
      dopelniacz: "czerwca",
      miejscownik: "czerwcu",
      narzednik: "czerwcem",
    },
    en: "June",
    de: "Juni",
    es: "junio",
  },
  {
    month: 7,
    pl: {
      name: "lipiec",
      dopelniacz: "lipca",
      miejscownik: "lipcu",
      narzednik: "lipcem",
    },
    en: "July",
    de: "Juli",
    es: "julio",
  },
  {
    month: 8,
    pl: {
      name: "sierpień",
      dopelniacz: "sierpnia",
      miejscownik: "sierpniu",
      narzednik: "sierpniem",
    },
    en: "August",
    de: "August",
    es: "agosto",
  },
  {
    month: 9,
    pl: {
      name: "wrzesień",
      dopelniacz: "września",
      miejscownik: "wrześniu",
      narzednik: "wrześniem",
    },
    en: "September",
    de: "September",
    es: "septiembre",
  },
  {
    month: 10,
    pl: {
      name: "październik",
      dopelniacz: "października",
      miejscownik: "październiku",
      narzednik: "październikiem",
    },
    en: "October",
    de: "Oktober",
    es: "octubre",
  },
  {
    month: 11,
    pl: {
      name: "listopad",
      dopelniacz: "listopada",
      miejscownik: "listopadzie",
      narzednik: "listopadem",
    },
    en: "November",
    de: "November",
    es: "noviembre",
  },
  {
    month: 12,
    pl: {
      name: "grudzień",
      dopelniacz: "grudnia",
      miejscownik: "grudniu",
      narzednik: "grudniem",
    },
    en: "December",
    de: "Dezember",
    es: "diciembre",
  },
] as const;

function iso(month: number): string {
  return `2027-${String(month).padStart(2, "0")}-02`;
}

describe("dateVars", () => {
  it("names and inflects every month, including adjectival luty", () => {
    for (const row of MONTHS) {
      const on = iso(row.month);
      const pad = String(row.month).padStart(2, "0");
      expect(dateVars(on, "pl")).toEqual({
        date: `2 ${row.pl.dopelniacz} 2027`,
        date_day: "2",
        date_day_pad: "02",
        date_month: String(row.month),
        date_month_pad: pad,
        date_year: "2027",
        date_month_name: row.pl.name,
        date_month_dopelniacz: row.pl.dopelniacz,
        date_month_miejscownik: row.pl.miejscownik,
        date_month_narzednik: row.pl.narzednik,
      });
      expect(dateVars(on, "en")).toEqual({
        date: `2 ${row.en} 2027`,
        date_day: "2",
        date_day_pad: "02",
        date_month: String(row.month),
        date_month_pad: pad,
        date_year: "2027",
        date_month_name: row.en,
        date_month_dopelniacz: row.en,
        date_month_miejscownik: row.en,
        date_month_narzednik: row.en,
      });
      expect(dateVars(on, "de")).toMatchObject({
        date: `2. ${row.de} 2027`,
        date_month_name: row.de,
        date_month_dopelniacz: row.de,
        date_month_miejscownik: row.de,
        date_month_narzednik: row.de,
      });
      expect(dateVars(on, "es")).toMatchObject({
        date: `2 de ${row.es} de 2027`,
        date_month_name: row.es,
        date_month_miejscownik: row.es,
      });
      expect(dateVars(on, "ja")).toMatchObject({
        date: `2027年${row.month}月2日`,
        date_month_name: `${row.month}月`,
        date_month_dopelniacz: `${row.month}月`,
        date_month_miejscownik: `${row.month}月`,
        date_month_narzednik: `${row.month}月`,
      });
    }
  });

  it("builds 2 August 2027 with and without leading zeros", () => {
    expect(dateVars("2027-08-02", "en")).toMatchObject({
      date: "2 August 2027",
      date_day: "2",
      date_day_pad: "02",
      date_month: "8",
      date_month_pad: "08",
      date_year: "2027",
    });
    expect(dateVars("2027-08-02", "pl").date).toBe("2 sierpnia 2027");
    expect(Object.keys(dateVars("2027-08-02", "pl")).sort()).toEqual(
      [...DATE_PLACEHOLDERS].sort(),
    );
  });

  it("uses Polish locative for listopad and genitive for a December day", () => {
    expect(dateVars("2027-11-24", "pl")).toMatchObject({
      date: "24 listopada 2027",
      date_month_name: "listopad",
      date_month_miejscownik: "listopadzie",
      date_month_narzednik: "listopadem",
      date_day: "24",
      date_day_pad: "24",
    });
    expect(dateVars("2027-12-24", "pl")).toMatchObject({
      date: "24 grudnia 2027",
      date_month_dopelniacz: "grudnia",
      date_month_miejscownik: "grudniu",
    });
  });

  it("accepts a leap day and falls unknown languages back to English", () => {
    expect(dateVars("2024-02-29", "pl").date).toBe("29 lutego 2024");
    expect(dateVars("2027-08-02", "fr")).toEqual(dateVars("2027-08-02", "en"));
  });

  it("names a blank party date and accepts a real one", () => {
    const message =
      "Enter the event date. Guest messages will include it, so these details cannot be saved without one.";
    expect(missingEventDateMessage(null)).toBe(message);
    expect(missingEventDateMessage(undefined)).toBe(message);
    expect(missingEventDateMessage("")).toBe(message);
    expect(missingEventDateMessage("   ")).toBe(message);
    expect(missingEventDateMessage("2026-12-24")).toBeNull();
  });

  it("blocks send until the party date is a real calendar date", () => {
    expect(missingEventDateSendReason(null)).toBe(MISSING_EVENT_DATE_SEND_REASON);
    expect(missingEventDateSendReason(undefined)).toBe(
      MISSING_EVENT_DATE_SEND_REASON,
    );
    expect(missingEventDateSendReason("")).toBe(MISSING_EVENT_DATE_SEND_REASON);
    expect(missingEventDateSendReason("   ")).toBe(
      MISSING_EVENT_DATE_SEND_REASON,
    );
    expect(missingEventDateSendReason("2026-13-01")).toBe(
      MISSING_EVENT_DATE_SEND_REASON,
    );
    expect(missingEventDateSendReason("2099-12-25")).toBeNull();
  });

  it("returns no keys for a missing or impossible date", () => {
    expect(dateVars(null, "pl")).toEqual({});
    expect(dateVars(undefined, "en")).toEqual({});
    expect(dateVars("", "de")).toEqual({});
    expect(dateVars("not-a-date", "pl")).toEqual({});
    expect(dateVars("2027-02-29", "pl")).toEqual({});
    expect(dateVars("2027-13-01", "ja")).toEqual({});
  });
});
