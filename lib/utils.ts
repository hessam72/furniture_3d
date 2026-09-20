import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Locale } from "@/i18n/routing";

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Latin digits → Persian digits. Used for aria-valuetext and dynamic numbers. */
export function toFaDigits(value: string | number) {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/**
 * A whole-number percentage, read aloud in `locale` — Persian digits with the
 * Persian word for "percent" on `fa`, plain Latin `%` on `en`. Used by the
 * before/after slider's `aria-valuetext`.
 */
export function formatPercent(value: number, locale: Locale) {
  return locale === "fa" ? `${toFaDigits(value)} درصد` : `${value}%`;
}
