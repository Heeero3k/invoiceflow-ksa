// "Daily project file": one Excel workbook per project per scan day, so a site
// supervisor can send the accountant a single file with that day's invoices.
import type { Invoice } from "../invoice";
import type { Lang } from "./columns";

export type DailyGroup = { key: string; project: string; day: string; invoices: Invoice[] };

const NO_PROJECT: Record<Lang, string> = { ar: "بدون مشروع", en: "No project" };

/** Local calendar day the invoice was scanned (YYYY-MM-DD). */
export function scanDay(invoice: Invoice) {
  const date = new Date(invoice.createdAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function projectLabel(invoice: Invoice, lang: Lang) {
  return invoice.projectName.trim().replace(/\s+/g, " ") || NO_PROJECT[lang];
}

/** Groups invoices by project and scan day; newest day first. */
export function groupDaily(invoices: Invoice[], lang: Lang): DailyGroup[] {
  const groups = new Map<string, DailyGroup>();
  for (const invoice of invoices) {
    const project = projectLabel(invoice, lang);
    const day = scanDay(invoice);
    const key = `${project.toLowerCase()}|${day}`;
    const group = groups.get(key) ?? { key, project, day, invoices: [] };
    group.invoices.push(invoice);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.day.localeCompare(a.day) || a.project.localeCompare(b.project));
}

/** Changes whenever an invoice in the group is added, removed or edited. */
export function groupSignature(group: DailyGroup) {
  return group.invoices
    .map((invoice) => `${invoice.id}@${invoice.updatedAt}`)
    .sort()
    .join(",");
}

export function dailyFileName(group: DailyGroup) {
  return `${group.project} - ${group.day}.xlsx`;
}

export function dailyTitle(group: DailyGroup, lang: Lang) {
  return lang === "ar" ? `${group.project} — فواتير يوم ${group.day}` : `${group.project} — invoices of ${group.day}`;
}
