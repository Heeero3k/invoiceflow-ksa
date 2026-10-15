import { useCallback, useMemo } from "react";
import type { FlexStyle, TextStyle } from "react-native";
import { CATEGORY_LABELS, type CategoryKey } from "@/shared/invoice";
import { usePreferences, type Language } from "./preferences";
import { ar, en, type StringKey } from "./strings";

const dictionaries: Record<Language, Record<StringKey, string>> = { ar, en };

export function translate(language: Language, key: StringKey, params?: Record<string, string | number>) {
  let text = dictionaries[language][key] ?? ar[key] ?? key;
  if (params) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

function formatterLocale(language: Language) {
  // Latin digits read better in financial figures for both languages.
  return language === "ar" ? "ar-SA-u-nu-latn" : "en-SA";
}

/**
 * Language + direction helpers. Native RTL is disabled app-wide, so layouts
 * mirror through `row`/`align` here and switching language is instant.
 */
export function useI18n() {
  const { language } = usePreferences();
  const isRTL = language === "ar";

  const t = useCallback((key: StringKey, params?: Record<string, string | number>) => translate(language, key, params), [language]);

  return useMemo(() => {
    const locale = formatterLocale(language);
    const money = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const compact = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
    const shortDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    const timeFormat = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });

    return {
      t,
      language,
      isRTL,
      row: (isRTL ? "row-reverse" : "row") as FlexStyle["flexDirection"],
      textAlign: (isRTL ? "right" : "left") as TextStyle["textAlign"],
      start: (isRTL ? "flex-end" : "flex-start") as FlexStyle["alignItems"],
      end: (isRTL ? "flex-start" : "flex-end") as FlexStyle["alignItems"],
      writingDirection: (isRTL ? "rtl" : "ltr") as TextStyle["writingDirection"],
      chevronForward: isRTL ? "chevron-left" : "chevron-right",
      chevronBack: isRTL ? "chevron-right" : "chevron-left",
      formatMoney: (value: number, withCurrency = true) => `${money.format(value || 0)}${withCurrency ? ` ${t("sar")}` : ""}`,
      formatCompact: (value: number) => compact.format(value || 0),
      formatDate: (value: string) => {
        if (!value) return "—";
        const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
        return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
      },
      formatShortDate: (value: string) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : shortDate.format(date);
      },
      formatTime: (value: string) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : timeFormat.format(date);
      },
      categoryLabel: (key: CategoryKey) => CATEGORY_LABELS[key][language],
    };
  }, [isRTL, language, t]);
}
