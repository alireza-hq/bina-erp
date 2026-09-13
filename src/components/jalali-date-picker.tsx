"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatJalaliDate,
  gregorianIsoToJalali,
  jalaliDaysInMonth,
  jalaliToGregorianIso,
  type JalaliParts,
} from "@/lib/jalali";
import { toPersianDigits } from "@/lib/persian";
import { todayInTehran } from "@/lib/work-reporting";

const months = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
const weekdays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function today() {
  return gregorianIsoToJalali(todayInTehran())!;
}

export function JalaliDatePicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const selected = useMemo(() => gregorianIsoToJalali(value), [value]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<JalaliParts>(() => selected ?? today());
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open)
      root.current
        ?.querySelector<HTMLButtonElement>('[aria-pressed="true"], .jalali-days button')
        ?.focus();
  }, [open]);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape" && root.current?.contains(document.activeElement)) {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, []);

  const firstGregorian = jalaliToGregorianIso(view.year, view.month, 1)!;
  const [gy, gm, gd] = firstGregorian.split("-").map(Number);
  const offset = (new Date(gy, gm - 1, gd).getDay() + 1) % 7;
  const totalDays = jalaliDaysInMonth(view.year, view.month);

  function moveMonth(amount: number) {
    setView((current) => {
      const index = current.year * 12 + current.month - 1 + amount;
      return { year: Math.floor(index / 12), month: (index % 12) + 1, day: 1 };
    });
  }

  function choose(day: number) {
    const iso = jalaliToGregorianIso(view.year, view.month, day);
    if (!iso) return;
    onChange(iso);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div className="jalali-date-picker" ref={root}>
      <button
        type="button"
        ref={trigger}
        className="jalali-date-trigger"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open && selected) setView(selected);
          setOpen((current) => !current);
        }}
      >
        <span>{formatJalaliDate(value)}</span>
        <CalendarDays size={17} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="jalali-picker-popover"
          role="dialog"
          aria-label="تقویم شمسی"
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            if (event.shiftKey && document.activeElement === buttons[0]) {
              event.preventDefault();
              buttons.at(-1)?.focus();
            } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
              event.preventDefault();
              buttons[0]?.focus();
            }
          }}
        >
          <div className="jalali-picker-head">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="ماه قبل">
              <ChevronRight size={18} />
            </button>
            <strong>
              {months[view.month - 1]} {toPersianDigits(view.year)}
            </strong>
            <button type="button" onClick={() => moveMonth(1)} aria-label="ماه بعد">
              <ChevronLeft size={18} />
            </button>
          </div>
          <div className="jalali-weekdays" aria-hidden="true">
            {weekdays.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="jalali-days">
            {Array.from({ length: offset }, (_, index) => (
              <span key={`empty-${index}`} />
            ))}
            {Array.from({ length: totalDays }, (_, index) => {
              const day = index + 1;
              const active =
                selected?.year === view.year &&
                selected.month === view.month &&
                selected.day === day;
              return (
                <button
                  type="button"
                  className={active ? "active" : ""}
                  aria-pressed={active}
                  aria-label={`${toPersianDigits(day)} ${months[view.month - 1]} ${toPersianDigits(view.year)}`}
                  onClick={() => choose(day)}
                  key={day}
                >
                  {toPersianDigits(day)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="jalali-today"
            onClick={() => {
              const current = today();
              setView(current);
              const iso = jalaliToGregorianIso(current.year, current.month, current.day);
              if (iso) onChange(iso);
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            امروز
          </button>
        </div>
      )}
    </div>
  );
}
