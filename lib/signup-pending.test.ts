import { afterEach, describe, expect, it } from "vitest";
import {
  setPendingOrganiser,
  takePendingOrganiser,
} from "@/lib/signup-pending";

describe("signup-pending", () => {
  afterEach(() => {
    takePendingOrganiser();
  });

  it("stores and consumes the pending organiser once", () => {
    setPendingOrganiser({
      name: "Ada",
      phone: "351912345678",
      email: "ada@example.com",
    });
    expect(takePendingOrganiser()).toEqual({
      name: "Ada",
      phone: "351912345678",
      email: "ada@example.com",
    });
    expect(takePendingOrganiser()).toBeNull();
  });
});
