import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type FocusEvent as ReactFocusEvent,
} from "react";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string | number> {
  /** Currently selected value (controlled). */
  value: T;
  options: readonly SelectOption<T>[];
  onChange(value: T): void;
  /** Accessible name — mirrors the aria-label the native <select> carried. */
  ariaLabel?: string;
  /** id placed on the trigger, so an external <label htmlFor> can point at it. */
  id?: string;
  /** Extra class on the trigger for visual appearance, e.g. "btn". */
  triggerClassName?: string;
  /** Stretch the control to fill a flex row (used by the loudness target rail). */
  fill?: boolean;
  disabled?: boolean;
}

/**
 * Step to the next non-disabled option from `from` in direction `dir`, wrapping
 * around. Returns `from` when every other option is disabled, -1 when empty.
 */
function stepIndex<T extends string | number>(
  options: readonly SelectOption<T>[],
  from: number,
  dir: 1 | -1,
): number {
  const n = options.length;
  if (n === 0) return -1;
  let i = from;
  for (let c = 0; c < n; c++) {
    i = (i + dir + n) % n;
    if (!options[i]?.disabled) return i;
  }
  return from;
}

/**
 * A custom, fully-styled dropdown that replaces the native <select> so it looks
 * identical across browsers and operating systems (native option lists are
 * OS-rendered and can't be styled). Implements the ARIA select-only combobox
 * pattern: focus stays on the combobox, `aria-activedescendant` tracks the
 * highlighted option, and the listbox supports arrow/Home/End/type-ahead
 * navigation, Enter/Space to commit, and Escape to dismiss.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  id,
  triggerClassName,
  fill,
  disabled,
}: SelectProps<T>): JSX.Element {
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const typeBuf = useRef("");
  const typeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number): string => `${baseId}-opt-${i}`;

  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : "";

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) comboRef.current?.focus();
  }, []);

  const openList = useCallback(() => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : stepIndex(options, -1, 1));
    setOpen(true);
  }, [disabled, options, selectedIndex]);

  const choose = useCallback(
    (i: number) => {
      const opt = options[i];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      close(true);
    },
    [options, onChange, close],
  );

  // Close on any pointer press outside the widget.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted option scrolled into view while navigating.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView?.({ block: "nearest" });
    // optionId is derived from a stable base id; only open/activeIndex matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  useEffect(() => () => clearTimeout(typeTimer.current), []);

  const typeAhead = (ch: string): void => {
    if (!open) openList();
    typeBuf.current += ch.toLowerCase();
    clearTimeout(typeTimer.current);
    typeTimer.current = setTimeout(() => (typeBuf.current = ""), 500);
    const match = options.findIndex(
      (o) => !o.disabled && o.label.toLowerCase().startsWith(typeBuf.current),
    );
    if (match >= 0) setActiveIndex(match);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (open) setActiveIndex((i) => stepIndex(options, i, 1));
        else openList();
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) setActiveIndex((i) => stepIndex(options, i, -1));
        else openList();
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(stepIndex(options, -1, 1));
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(stepIndex(options, 0, -1));
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (open) choose(activeIndex);
        else openList();
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          close(true);
        }
        break;
      case "Tab":
        if (open) setOpen(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) typeAhead(e.key);
    }
  };

  // Close when focus leaves the whole widget (e.g. Shift+Tab away).
  const onBlur = (e: ReactFocusEvent<HTMLDivElement>): void => {
    if (!wrapperRef.current?.contains(e.relatedTarget as Node | null)) {
      setOpen(false);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={"select" + (fill ? " select--fill" : "")}
      onBlur={onBlur}
    >
      <div
        ref={comboRef}
        id={id}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        className={"select__trigger" + (triggerClassName ? ` ${triggerClassName}` : "")}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="select__label">{selectedLabel}</span>
        <span className="select__arrow" aria-hidden="true">
          ▾
        </span>
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="select__list"
        >
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={optionId(i)}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              className={
                "select__option" + (i === activeIndex ? " select__option--active" : "")
              }
              onMouseEnter={() => !o.disabled && setActiveIndex(i)}
              // Keep focus on the combobox so aria-activedescendant stays valid.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
