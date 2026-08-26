"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type Option<T extends string> = { value: T; label: string };

export function CustomSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, []);

  return (
    <div className="custom-select" ref={root}>
      <button
        type="button"
        className="custom-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{selected?.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="custom-select-menu" id={listId} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
