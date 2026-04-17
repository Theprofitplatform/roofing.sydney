"use client";

import { COLORBOND_COLOURS, type ColorbondColour } from "@/lib/colorbond";

type Props = {
  selected: ColorbondColour | null;
  onSelect: (c: ColorbondColour) => void;
  disabled?: boolean;
};

export function ColorbondPicker({ selected, onSelect, disabled }: Props) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Colorbond colour
        </h3>
        <span className="text-xs text-muted">
          {selected ? selected.name : "Tap to preview"}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:grid-cols-7 md:grid-cols-10">
        {COLORBOND_COLOURS.map((c) => {
          const active = selected?.id === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              disabled={disabled}
              aria-pressed={active}
              title={c.name}
              className={`group relative aspect-square rounded-lg border outline-none transition-transform disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-background border-transparent"
                  : "border-border hover:scale-[1.04]"
              }`}
              style={{ backgroundColor: c.hex }}
            >
              <span className="sr-only">{c.name}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-2">
        On-screen colours are approximations. Confirm with a physical Colorbond®
        sample before purchase.
      </p>
    </div>
  );
}
