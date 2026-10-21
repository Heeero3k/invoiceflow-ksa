import { describe, expect, it } from "vitest";
import { dailyFileName, groupDaily, groupSignature, scanDay } from "../shared/export/daily";
import { emptyInvoice } from "../shared/invoice";

// Local-time timestamps so the test does not depend on the machine's time zone.
const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`).toISOString();

const invoices = [
  emptyInvoice({ id: "a", projectName: "مشروع تبوك", createdAt: at("2026-10-21", 9), updatedAt: at("2026-10-21", 9) }),
  emptyInvoice({ id: "b", projectName: " مشروع  تبوك ", createdAt: at("2026-10-21", 15), updatedAt: at("2026-10-21", 15) }),
  emptyInvoice({ id: "c", projectName: "مشروع تبوك", createdAt: at("2026-10-20", 11), updatedAt: at("2026-10-20", 11) }),
  emptyInvoice({ id: "d", projectName: "", createdAt: at("2026-10-21", 10), updatedAt: at("2026-10-21", 10) }),
];

describe("daily project file", () => {
  const groups = groupDaily(invoices, "ar");

  it("puts each project's invoices of the same scan day in one file", () => {
    expect(groups.map((group) => [group.project, group.day, group.invoices.map((invoice) => invoice.id)])).toEqual([
      ["بدون مشروع", "2026-10-21", ["d"]],
      ["مشروع تبوك", "2026-10-21", ["a", "b"]],
      ["مشروع تبوك", "2026-10-20", ["c"]],
    ]);
    expect(dailyFileName(groups[1])).toBe("مشروع تبوك - 2026-10-21.xlsx");
    expect(scanDay(invoices[2])).toBe("2026-10-20");
  });

  it("changes the signature when an invoice is edited, not when order changes", () => {
    const group = groups[1];
    const reordered = { ...group, invoices: [...group.invoices].reverse() };
    expect(groupSignature(reordered)).toBe(groupSignature(group));
    const edited = { ...group, invoices: [group.invoices[0], { ...group.invoices[1], updatedAt: at("2026-10-21", 16) }] };
    expect(groupSignature(edited)).not.toBe(groupSignature(group));
  });
});
