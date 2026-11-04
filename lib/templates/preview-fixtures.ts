import type { BudgetKind, Currency } from "@/lib/budget";
import type { Gender } from "@/lib/gender";
import type { EventLocationFields } from "@/lib/event-location";
import type { EventNameFields } from "@/lib/event-name";
import type { Language } from "@/lib/language";
import type { NameCases } from "@/lib/name-cases";

/**
 * Preview-only people and editions. They are not written to the database.
 * Every guest passes the person form, and every edition passes the event
 * form: a real date, Polish / German / Spanish / Japanese titles, six Polish
 * cases, and an explicit budget choice (`amount`, `zero`, or `unlimited`).
 *
 * Foreign names that Polish does not inflect stay the same in every case.
 * Japanese names are copied through the cases, which is what a careful
 * organiser does when a name has no Polish declension.
 */

export type PreviewGuest = NameCases & {
  id: string;
  phone: string | null;
  email: string | null;
  language: Language;
  gender: Gender;
  /** File under `public/preview/guests/`, or null for the initials fallback. */
  photo: string | null;
  wishlist: readonly string[];
};

export type PreviewPastGift = {
  giverId: string;
  year: number;
  receiverId: string;
};

export type PreviewEvent = EventNameFields &
  EventLocationFields & {
  id: string;
  occursOn: string;
  budgetKind: BudgetKind;
  budget: number | null;
  currency: Currency;
  budgetEur: number | null;
  budgetPln: number | null;
  budgetJpy: number | null;
  guestIds: readonly string[];
  guests: readonly PreviewGuest[];
  previousGifts?: readonly PreviewPastGift[];
};

type NameCasesOnly = Pick<
  NameCases,
  | "nameDopelniacz"
  | "nameCelownik"
  | "nameBiernik"
  | "nameNarzednik"
  | "nameMiejscownik"
  | "nameWolacz"
>;

function cases(
  dopelniacz: string,
  celownik: string,
  biernik: string,
  narzednik: string,
  miejscownik: string,
  wolacz: string,
): NameCasesOnly {
  return {
    nameDopelniacz: dopelniacz,
    nameCelownik: celownik,
    nameBiernik: biernik,
    nameNarzednik: narzednik,
    nameMiejscownik: miejscownik,
    nameWolacz: wolacz,
  };
}

function sameCases(name: string): NameCasesOnly {
  return cases(name, name, name, name, name, name);
}

function amountBudget(
  budget: number,
  currency: Currency,
  eur: number,
  pln: number,
  jpy: number,
) {
  return {
    budgetKind: "amount" as const,
    budget,
    currency,
    budgetEur: eur,
    budgetPln: pln,
    budgetJpy: jpy,
  };
}

function choiceBudget(kind: "zero" | "unlimited") {
  return {
    budgetKind: kind,
    budget: null,
    currency: "EUR" as const,
    budgetEur: null,
    budgetPln: null,
    budgetJpy: null,
  };
}

const GUEST_LIST: PreviewGuest[] = [
  {
    id: "anna",
    name: "Anna Kowalska",
    ...cases(
      "Anny Kowalskiej",
      "Annie Kowalskiej",
      "Annę Kowalską",
      "Anną Kowalską",
      "Annie Kowalskiej",
      "Anno Kowalska",
    ),
    phone: "48501234567",
    email: "anna.kowalska@example.com",
    language: "pl",
    gender: "female",
    photo: "anna.jpg",
    wishlist: ["Ciepły szalik", "Książka kucharska"],
  },
  {
    id: "piotr",
    name: "Piotr Nowak",
    ...cases(
      "Piotra Nowaka",
      "Piotrowi Nowakowi",
      "Piotra Nowaka",
      "Piotrem Nowakiem",
      "Piotrze Nowaku",
      "Piotrze Nowaku",
    ),
    phone: "48601234567",
    email: null,
    language: "pl",
    gender: "male",
    photo: "piotr.jpg",
    wishlist: ["Słuchawki"],
  },
  {
    id: "zosia",
    name: "Zosia Kowalska",
    ...cases(
      "Zosi Kowalskiej",
      "Zosi Kowalskiej",
      "Zosię Kowalską",
      "Zosią Kowalską",
      "Zosi Kowalskiej",
      "Zosiu Kowalska",
    ),
    phone: null,
    email: null,
    language: "pl",
    gender: "female",
    photo: "zosia.jpg",
    wishlist: [],
  },
  {
    id: "aleksander",
    name: "Aleksander Wiśniewski",
    ...cases(
      "Aleksandra Wiśniewskiego",
      "Aleksandrowi Wiśniewskiemu",
      "Aleksandra Wiśniewskiego",
      "Aleksandrem Wiśniewskim",
      "Aleksandrze Wiśniewskim",
      "Aleksandrze Wiśniewski",
    ),
    phone: "48791234567",
    email: "aleksander.wisniewski@example.com",
    language: "pl",
    gender: "male",
    photo: "aleksander.jpg",
    wishlist: ["Gra planszowa"],
  },
  {
    id: "maria",
    name: "María García",
    ...cases(
      "Marii García",
      "Marii García",
      "Marię García",
      "Marią García",
      "Marii García",
      "Mario García",
    ),
    phone: null,
    email: "maria.garcia@example.com",
    language: "es",
    gender: "female",
    photo: "maria.jpg",
    wishlist: ["Una bufanda de lana"],
  },
  {
    id: "lucia",
    name: "Lucía Fernández",
    ...cases(
      "Lucii Fernández",
      "Lucii Fernández",
      "Lucię Fernández",
      "Lucią Fernández",
      "Lucii Fernández",
      "Lucio Fernández",
    ),
    phone: null,
    email: "lucia.fernandez@example.com",
    language: "es",
    gender: "female",
    photo: null,
    wishlist: [],
  },
  {
    id: "hans",
    name: "Hans Müller",
    ...cases(
      "Hansa Müller",
      "Hansowi Müller",
      "Hansa Müller",
      "Hansem Müller",
      "Hansie Müller",
      "Hansie Müller",
    ),
    phone: "4915112345678",
    email: "hans.mueller@example.com",
    language: "de",
    gender: "male",
    photo: "hans.jpg",
    wishlist: ["Ein gutes Kochbuch"],
  },
  {
    id: "sophie",
    name: "Sophie Becker",
    ...sameCases("Sophie Becker"),
    phone: null,
    email: "sophie.becker@example.com",
    language: "de",
    gender: "female",
    photo: null,
    wishlist: ["Wollsocken"],
  },
  {
    id: "james",
    name: "James O'Neill",
    ...cases(
      "Jamesa O'Neill",
      "Jamesowi O'Neill",
      "Jamesa O'Neill",
      "Jamesem O'Neill",
      "Jamesie O'Neill",
      "Jamesie O'Neill",
    ),
    phone: "447911123456",
    email: "james.oneill@example.com",
    language: "en",
    gender: "male",
    photo: null,
    wishlist: ["A hardcover novel"],
  },
  {
    id: "joao",
    name: "João Silva",
    ...sameCases("João Silva"),
    phone: "351912345678",
    email: null,
    language: "en",
    gender: "male",
    photo: "joao.jpg",
    wishlist: [],
  },
  {
    id: "yuki",
    name: "Yuki Tanaka",
    ...sameCases("Yuki Tanaka"),
    phone: "819012345678",
    email: "yuki.tanaka@example.com",
    language: "ja",
    gender: "female",
    photo: "yuki.jpg",
    wishlist: ["ハンドクリーム"],
  },
  {
    id: "kenji",
    name: "Kenji Watanabe",
    ...sameCases("Kenji Watanabe"),
    phone: "818012345678",
    email: null,
    language: "ja",
    gender: "male",
    photo: "kenji.jpg",
    wishlist: ["コーヒー豆"],
  },
];

export const PREVIEW_GUESTS: readonly PreviewGuest[] = GUEST_LIST;

const guestById = new Map(GUEST_LIST.map((guest) => [guest.id, guest]));

function withGuests(
  event: Omit<PreviewEvent, "guests">,
): PreviewEvent {
  return {
    ...event,
    guests: event.guestIds.map((id) => guestById.get(id)!),
  };
}

export const PREVIEW_EVENTS: readonly PreviewEvent[] = [
  withGuests({
    id: "family",
    name: "Rodzinne Święta 2026",
    nameEn: "Family Christmas 2026",
    nameDe: "Familienweihnachten 2026",
    nameEs: "Navidad en familia 2026",
    nameJa: "家族のクリスマス2026",
    namePl: "Rodzinne Święta 2026",
    ...cases(
      "Rodzinnych Świąt 2026",
      "Rodzinnym Świętom 2026",
      "Rodzinne Święta 2026",
      "Rodzinnymi Świętami 2026",
      "Rodzinnych Świętach 2026",
      "Rodzinne Święta 2026",
    ),
    occursOn: "2026-12-24",
    location: "Katowice",
    locationGdzie: "w Katowicach",
    ...amountBudget(50, "EUR", 50, 215, 8000),
    guestIds: ["anna", "piotr", "zosia", "aleksander", "maria", "hans"],
    previousGifts: [
      { giverId: "anna", year: 2025, receiverId: "zosia" },
      { giverId: "anna", year: 2024, receiverId: "lucia" },
      { giverId: "piotr", year: 2025, receiverId: "aleksander" },
      { giverId: "piotr", year: 2024, receiverId: "maria" },
      { giverId: "zosia", year: 2025, receiverId: "anna" },
      { giverId: "aleksander", year: 2024, receiverId: "hans" },
    ],
  }),
  withGuests({
    id: "office",
    name: "Office Secret Santa",
    nameEn: "Office Secret Santa",
    nameDe: "Wichteln im Büro",
    nameEs: "Amigo invisible de la oficina",
    nameJa: "職場のシークレットサンタ",
    namePl: "Firmowy Mikołaj",
    ...cases(
      "Firmowego Mikołaja",
      "Firmowemu Mikołajowi",
      "Firmowego Mikołaja",
      "Firmowym Mikołajem",
      "Firmowym Mikołaju",
      "Firmowy Mikołaju",
    ),
    occursOn: "2026-12-18",
    location: "Kraków",
    locationGdzie: "w Krakowie",
    ...amountBudget(30, "PLN", 7, 30, 1120),
    guestIds: [
      "anna",
      "piotr",
      "aleksander",
      "maria",
      "lucia",
      "hans",
      "sophie",
      "james",
    ],
    previousGifts: [
      { giverId: "anna", year: 2025, receiverId: "lucia" },
      { giverId: "hans", year: 2025, receiverId: "sophie" },
      { giverId: "hans", year: 2024, receiverId: "james" },
    ],
  }),
  withGuests({
    id: "amigo",
    name: "Amigo invisible",
    nameEn: "Secret Santa",
    nameDe: "Wichteln",
    nameEs: "Amigo invisible",
    nameJa: "スペインのシークレットサンタ",
    namePl: "Niewidzialny przyjaciel",
    ...cases(
      "Niewidzialnego przyjaciela",
      "Niewidzialnemu przyjacielowi",
      "Niewidzialnego przyjaciela",
      "Niewidzialnym przyjacielem",
      "Niewidzialnym przyjacielu",
      "Niewidzialny przyjacielu",
    ),
    occursOn: "2027-01-05",
    location: "Madrid",
    locationGdzie: "w Madrycie",
    ...choiceBudget("unlimited"),
    guestIds: ["maria", "lucia", "joao", "james"],
  }),
  withGuests({
    id: "alpine",
    name: "Wichteln im Alpenverein",
    nameEn: "Alpine club gift exchange",
    nameDe: "Wichteln im Alpenverein",
    nameEs: "Intercambio del club alpino",
    nameJa: "アルペンクラブのプレゼント交換",
    namePl: "Mikołajki w klubie alpejskim",
    ...cases(
      "Mikołajek w klubie alpejskim",
      "Mikołajkom w klubie alpejskim",
      "Mikołajki w klubie alpejskim",
      "Mikołajkami w klubie alpejskim",
      "Mikołajkach w klubie alpejskim",
      "Mikołajki w klubie alpejskim",
    ),
    occursOn: "2026-12-06",
    location: "Innsbruck",
    locationGdzie: "w Innsbrucku",
    ...amountBudget(25, "EUR", 25, 108, 4000),
    guestIds: ["hans", "sophie", "piotr"],
  }),
  withGuests({
    id: "children",
    name: "子供会のサンタ",
    nameEn: "Children's party Santa",
    nameDe: "Weihnachtsmann beim Kinderfest",
    nameEs: "Papá Noel de la fiesta infantil",
    nameJa: "子供会のサンタ",
    namePl: "Mikołaj na zabawie dla dzieci",
    ...cases(
      "Mikołaja na zabawie dla dzieci",
      "Mikołajowi na zabawie dla dzieci",
      "Mikołaja na zabawie dla dzieci",
      "Mikołajem na zabawie dla dzieci",
      "Mikołaju na zabawie dla dzieci",
      "Mikołaju na zabawie dla dzieci",
    ),
    occursOn: "2027-01-06",
    location: "Kyoto",
    locationGdzie: "w Kioto",
    ...choiceBudget("zero"),
    guestIds: ["zosia", "yuki"],
  }),
  withGuests({
    id: "summer",
    name: "Letnia wymiana prezentów",
    nameEn: "Summer gift exchange",
    nameDe: "Sommer-Geschenketausch",
    nameEs: "Intercambio de regalos de verano",
    nameJa: "夏のプレゼント交換",
    namePl: "Letnia wymiana prezentów",
    ...cases(
      "Letniej wymiany prezentów",
      "Letniej wymianie prezentów",
      "Letnią wymianę prezentów",
      "Letnią wymianą prezentów",
      "Letniej wymianie prezentów",
      "Letnia wymiano prezentów",
    ),
    occursOn: "2027-06-21",
    location: "Wrocław",
    locationGdzie: "we Wrocławiu",
    ...choiceBudget("unlimited"),
    guestIds: GUEST_LIST.map((guest) => guest.id),
    previousGifts: [
      { giverId: "anna", year: 2026, receiverId: "piotr" },
      { giverId: "anna", year: 2025, receiverId: "zosia" },
      { giverId: "yuki", year: 2026, receiverId: "kenji" },
    ],
  }),
  withGuests({
    id: "valentine",
    name: "Walentynkowy duet",
    nameEn: "Valentine duet",
    nameDe: "Valentinsduo",
    nameEs: "Dúo de San Valentín",
    nameJa: "バレンタインの二人",
    namePl: "Walentynkowy duet",
    ...cases(
      "Walentynkowego duetu",
      "Walentynkowemu duetowi",
      "Walentynkowy duet",
      "Walentynkowym duetem",
      "Walentynkowym duecie",
      "Walentynkowy duecie",
    ),
    occursOn: "2027-02-14",
    location: "Dom babci",
    locationGdzie: "u babci",
    ...amountBudget(15, "EUR", 15, 65, 2400),
    guestIds: ["anna", "piotr"],
  }),
];
