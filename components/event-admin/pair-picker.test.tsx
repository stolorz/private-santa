/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { PairPicker } from "@/components/event-admin/pair-picker";

const people = [
  { id: 1, name: "Ada" },
  { id: 2, name: "Bea" },
];

describe("PairPicker", () => {
  it("keeps submit disabled until both sides are chosen", () => {
    render(
      <PairPicker
        left=""
        right=""
        onLeftChange={vi.fn()}
        onRightChange={vi.fn()}
        leftPlaceholder="Giver"
        rightPlaceholder="Receiver"
        leftOptions={people}
        rightOptions={people}
        submitLabel="Add pair"
        isBlocked={() => false}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Add pair" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("submits when both sides are set", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    render(
      <PairPicker
        left="1"
        right="2"
        onLeftChange={vi.fn()}
        onRightChange={vi.fn()}
        leftPlaceholder="Giver"
        rightPlaceholder="Receiver"
        leftOptions={people}
        rightOptions={people}
        submitLabel="Add pair"
        isBlocked={() => false}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add pair" }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("checks isBlocked in left-to-right order so directed rules stay asymmetric", () => {
    const isBlocked = vi.fn(
      (leftId: number, rightId: number) => leftId === 1 && rightId === 2,
    );
    const { rerender } = render(
      <PairPicker
        left="1"
        right="2"
        onLeftChange={vi.fn()}
        onRightChange={vi.fn()}
        leftPlaceholder="Giver"
        rightPlaceholder="Receiver"
        leftOptions={people}
        rightOptions={people}
        submitLabel="Add pair"
        isBlocked={isBlocked}
        onSubmit={vi.fn()}
      />,
    );
    expect(isBlocked).toHaveBeenCalledWith(1, 2);
    expect(screen.getByRole("button", { name: "Add pair" })).toHaveProperty(
      "disabled",
      true,
    );

    rerender(
      <PairPicker
        left="2"
        right="1"
        onLeftChange={vi.fn()}
        onRightChange={vi.fn()}
        leftPlaceholder="Giver"
        rightPlaceholder="Receiver"
        leftOptions={people}
        rightOptions={people}
        submitLabel="Add pair"
        isBlocked={isBlocked}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Add pair" })).toHaveProperty(
      "disabled",
      false,
    );
  });
});
