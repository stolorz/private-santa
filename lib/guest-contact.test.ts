import { describe, expect, it } from "vitest";
import {
  contactDraftChanged,
  guestContactSummary,
  joinNames,
  sharedContactIssuesForDraft,
  sharedContactTitle,
  sharedContactTooltip,
  sharedContactWarningLines,
  sharedContactsByGuestId,
} from "./guest-contact";

const ada = {
  id: 1,
  name: "Ada",
  phone: "351912345678",
  email: "ada@example.com",
};
const bea = {
  id: 2,
  name: "Bea",
  phone: "351911111111",
  email: "bea@example.com",
};

describe("joinNames", () => {
  it("formats one, two, and many names", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Ada"])).toBe("Ada");
    expect(joinNames(["Ada", "Bea"])).toBe("Ada and Bea");
    expect(joinNames(["Ada", "Bea", "Cyd"])).toBe("Ada, Bea, and Cyd");
  });
});

describe("contactDraftChanged", () => {
  it("treats a new guest as a change", () => {
    expect(
      contactDraftChanged(undefined, { phone: "351912345678", email: null }),
    ).toBe(true);
  });

  it("ignores empty vs null and email casing", () => {
    expect(
      contactDraftChanged(
        { phone: null, email: "ada@example.com" },
        { phone: "", email: "Ada@Example.com" },
      ),
    ).toBe(false);
  });

  it("detects a phone or email change", () => {
    expect(
      contactDraftChanged(
        { phone: "351912345678", email: null },
        { phone: "351911111111", email: null },
      ),
    ).toBe(true);
  });
});

describe("sharedContactIssuesForDraft", () => {
  it("does not flag blank phone or email", () => {
    expect(
      sharedContactIssuesForDraft(
        [
          { id: 1, name: "Ada", phone: null, email: null },
          { id: 2, name: "Bea", phone: null, email: "" },
        ],
        { phone: "", email: "  " },
      ),
    ).toEqual([]);
  });

  it("flags a phone already used by another guest", () => {
    expect(
      sharedContactIssuesForDraft([ada, bea], {
        id: 2,
        phone: "351912345678",
        email: bea.email,
      }),
    ).toEqual([
      {
        field: "phone",
        stored: "351912345678",
        label: "+351 912 345 678",
        names: ["Ada"],
      },
    ]);
  });

  it("flags an email already used, ignoring case", () => {
    expect(
      sharedContactIssuesForDraft([ada, bea], {
        id: 2,
        phone: bea.phone,
        email: "Ada@Example.com",
      }),
    ).toEqual([
      {
        field: "email",
        stored: "ada@example.com",
        label: "ada@example.com",
        names: ["Ada"],
      },
    ]);
  });

  it("does not flag the guest's own current contact", () => {
    expect(
      sharedContactIssuesForDraft([ada, bea], {
        id: 1,
        phone: ada.phone,
        email: ada.email,
      }),
    ).toEqual([]);
  });
});

describe("sharedContactsByGuestId", () => {
  it("marks every guest who shares a phone or email", () => {
    const cyd = {
      id: 3,
      name: "Cyd",
      phone: ada.phone,
      email: bea.email,
    };
    const map = sharedContactsByGuestId([ada, bea, cyd]);
    expect([...map.keys()].sort()).toEqual([1, 2, 3]);
    expect(sharedContactTooltip(map.get(3)!)).toBe(
      "Same phone as Ada. Same email as Bea",
    );
  });
});

describe("shared contact copy", () => {
  it("titles a phone and email warning", () => {
    const cyd = {
      id: 3,
      name: "Cyd",
      phone: ada.phone,
      email: ada.email,
    };
    const issues = sharedContactIssuesForDraft([ada, cyd], {
      phone: ada.phone,
      email: ada.email,
    });
    expect(sharedContactTitle(issues)).toBe("Shared contact details");
  });

  it("titles an email-only warning", () => {
    const issues = sharedContactIssuesForDraft([ada, bea], {
      email: ada.email,
    });
    expect(sharedContactTitle(issues)).toBe("Shared email address");
  });

  it("titles a phone-only warning", () => {
    const issues = sharedContactIssuesForDraft([ada, bea], {
      phone: ada.phone,
    });
    expect(sharedContactTitle(issues)).toBe("Shared phone number");
    expect(sharedContactWarningLines(issues)).toEqual([
      "+351 912 345 678 is already used by Ada.",
    ]);
  });
});

describe("guestContactSummary", () => {
  it("joins phone, email, language and gender", () => {
    expect(
      guestContactSummary({
        phone: "351912345678",
        email: "ada@example.com",
        language: "en",
        gender: "female",
      }),
    ).toMatch(/ada@example.com/);
    expect(
      guestContactSummary({
        phone: null,
        email: null,
        language: "pl",
        gender: null,
      }),
    ).toBe("Polish");
  });
});
