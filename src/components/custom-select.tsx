"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type Option<T extends string> = { value: T; label: string };

export function CustomSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  searchable = false,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const visible = options.filter(
    (option) => !search || option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function close(event: PointerEvent) {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    }
    function closeWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape" && menu.current) {
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

  useEffect(() => {
    if (!open || menuStyle.width === undefined) return;
    const target = searchable
      ? menu.current?.querySelector<HTMLElement>("input")
      : (menu.current?.querySelector<HTMLElement>('[aria-selected="true"]') ??
        menu.current?.querySelector<HTMLElement>('[role="option"]'));
    target?.focus();
  }, [open, menuStyle.width, searchable]);

  useEffect(() => {
    if (!open) return;
    function positionMenu() {
      const rect = root.current?.getBoundingClientRect();
      if (!rect) return;
      const estimatedHeight = Math.min(options.length * 38, 210) + (searchable ? 58 : 10);
      const opensUp = window.innerHeight - rect.bottom < estimatedHeight + 12;
      setMenuStyle({
        position: "fixed",
        right: "auto",
        bottom: "auto",
        left: rect.left,
        top: opensUp ? Math.max(8, rect.top - estimatedHeight - 6) : rect.bottom + 6,
        width: rect.width,
      });
    }
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, options.length, searchable]);

  return (
    <div className="custom-select" ref={root}>
      <button
        type="button"
        ref={trigger}
        className="custom-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          setSearch("");
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setSearch("");
            setOpen(true);
          }
        }}
      >
        <bdi>{selected?.label}</bdi>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open &&
        !disabled &&
        menuStyle.width !== undefined &&
        createPortal(
          <div
            className="custom-select-menu"
            ref={menu}
            style={menuStyle}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                setOpen(false);
                trigger.current?.focus();
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              if (event.target instanceof HTMLInputElement && ["Home", "End"].includes(event.key))
                return;
              const buttons = Array.from(
                menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || [],
              );
              if (!buttons.length) return;
              event.preventDefault();
              const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (current < 0
                        ? event.key === "ArrowDown"
                          ? 0
                          : buttons.length - 1
                        : current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                      buttons.length;
              buttons[next].focus();
            }}
          >
            {searchable && (
              <input
                aria-label={`جستجوی ${ariaLabel}`}
                placeholder="جستجو…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            )}
            <div id={listId} role="listbox" aria-label={ariaLabel} className="select-options">
              {visible.map((option) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  tabIndex={-1}
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    trigger.current?.focus();
                  }}
                >
                  <bdi>{option.label}</bdi>
                  {option.value === value && <Check size={15} aria-hidden="true" />}
                </button>
              ))}
              {!visible.length && (
                <p role="status" className="admin-empty">
                  گزینه‌ای پیدا نشد.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
