"use client";
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Person } from "@/lib/db/schema";
import { compareNames } from "@/lib/person-name";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

function contactHint(person: Person): string {
  return [person.phone ? formatPhone(person.phone) : null, person.email]
    .filter(Boolean)
    .join(" · ");
}

function searchValue(person: Person): string {
  return [
    String(person.id),
    person.name,
    person.email ?? "",
    person.phone ?? "",
    person.phone ? formatPhone(person.phone) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function ExistingPersonPicker({
  people,
  selectedId,
  onSelect,
  onClear,
  disabled,
}: {
  people: Person[];
  selectedId: number | null;
  onSelect: (person: Person) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () =>
      [...people].sort((a, b) => compareNames(a.name, b.name) || a.id - b.id),
    [people],
  );
  const selected =
    selectedId != null ? people.find((p) => p.id === selectedId) : undefined;

  return (
    <div className="flex gap-1 sm:col-span-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Existing person"
            disabled={disabled}
            className="min-w-0 flex-1 justify-between font-normal"
          >
            <span className="truncate">
              {selected?.name ?? "Choose existing person"}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0"
        >
          <Command>
            <CommandInput placeholder="Search people..." />
            <CommandList>
              <CommandEmpty>No matching people.</CommandEmpty>
              <CommandGroup>
                {sorted.map((person) => {
                  const hint = contactHint(person);
                  return (
                    <CommandItem
                      key={person.id}
                      value={searchValue(person)}
                      onSelect={() => {
                        onSelect(person);
                        setOpen(false);
                      }}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{person.name}</span>
                        {hint ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {hint}
                          </span>
                        ) : null}
                      </span>
                      <Check
                        className={cn(
                          "ml-auto size-4 shrink-0",
                          person.id === selectedId
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedId != null ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Create new instead"
          disabled={disabled}
          onClick={onClear}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
