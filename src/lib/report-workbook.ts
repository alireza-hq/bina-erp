// Node-only writer: imported exclusively by the server export route and tests.
import writeExcelFile, { type CellObject, type SheetData } from "write-excel-file/node";
import type { getBusinessReportExport } from "@/lib/business-reports";
import { groupLabels } from "@/lib/business-report-query";
import { type ExportMode } from "@/lib/report-export-query";
import { formatJalaliDate } from "@/lib/jalali";

type ExportData = Awaited<ReturnType<typeof getBusinessReportExport>>;
export class WorkbookValueError extends Error {}
export function workbookText(value: string | null | undefined): CellObject {
  const text = (value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "");
  if (text.length > 32760)
    throw new WorkbookValueError(
      "متن یکی از سلول‌ها از ظرفیت Excel بیشتر است؛ فیلترها یا متن را بررسی کنید.",
    );
  // Explicit string type prevents formula interpretation. Prefix risky text as defense in depth.
  return {
    type: String,
    value: /^[\s\u200e\u200f\u202a-\u202e]*[=+\-@]/u.test(text) ? "'" + text : text,
    align: "right",
    alignVertical: "top",
    wrap: true,
  };
}
export function workbookNumber(value: string): CellObject {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new WorkbookValueError("مقدار عددی گزارش معتبر نیست");
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  // Keep well below Excel's 15 significant-digit limit; no fractional arithmetic is performed.
  if (cents > BigInt("99999999999999"))
    throw new WorkbookValueError("مجموع گزارش از دقت عددی مجاز بیشتر است");
  return {
    type: Number,
    value: Number(`${whole}.${fraction.padEnd(2, "0")}`),
    format: "0.00",
    align: "right",
  };
}
function header(labels: string[]) {
  return labels.map((label) => ({
    ...workbookText(label),
    fontWeight: "bold" as const,
    backgroundColor: "#173F55",
    textColor: "#FFFFFF",
  }));
}
export async function createReportWorkbook(
  data: ExportData,
  mode: ExportMode,
  generatedAt = new Date(),
) {
  const q = data.query;
  let rows: SheetData;
  let widths: number[];
  if (mode === "details") {
    rows = [
      header([
        "تاریخ شمسی",
        "نام کارمند",
        "کد پرسنلی",
        "نام کاربری",
        "واحد فعلی",
        "کد پروژه",
        "پروژه",
        "فایل پروژه",
        "شرح فعالیت",
        "نفر-ساعت",
      ]),
      ...data.entries.map((row) => [
        workbookText(formatJalaliDate(row.date)),
        workbookText(row.employeeName),
        workbookText(row.employeeCode),
        workbookText(row.username),
        workbookText(row.department),
        workbookText(row.projectCode),
        workbookText(row.projectName),
        workbookText(row.projectFile),
        workbookText(row.description),
        workbookNumber(row.manHours),
      ]),
    ];
    widths = [16, 26, 16, 24, 24, 18, 30, 40, 65, 16];
  } else if (q.groupBy) {
    const groupDate = (value: string, dimension: string) =>
      dimension === "date" ? formatJalaliDate(value) : value;
    rows = [
      header([
        groupLabels[q.groupBy],
        ...(q.groupBySecondary ? [groupLabels[q.groupBySecondary]] : []),
        "تعداد ردیف",
        "نفر-ساعت",
      ]),
      ...data.groups.map((row) => [
        workbookText(groupDate(row.primaryLabel, q.groupBy!)),
        ...(q.groupBySecondary
          ? [workbookText(groupDate(row.secondaryLabel, q.groupBySecondary))]
          : []),
        { type: Number, value: Number(row.entryCount), format: "0" },
        workbookNumber(row.totalHours),
      ]),
    ];
    widths = q.groupBySecondary ? [45, 45, 18, 18] : [45, 18, 18];
  } else {
    rows = [
      header(["گزارش", "تعداد ردیف", "نفر-ساعت"]),
      [
        workbookText("جمع کل فیلترشده"),
        { type: Number, value: data.entryCount, format: "0" },
        workbookNumber(data.totalHours),
      ],
    ];
    widths = [40, 18, 18];
  }
  const metadata: SheetData = [
    header(["مشخصات گزارش", "مقدار"]),
    [workbookText("نوع گزارش"), workbookText(mode === "details" ? "تفصیلی" : "خلاصه")],
    [workbookText("از تاریخ (شمسی)"), workbookText(formatJalaliDate(q.from))],
    [workbookText("تا تاریخ (شمسی، شامل روز پایان)"), workbookText(formatJalaliDate(q.to))],
    [workbookText("بازه میلادی ISO"), workbookText(`${q.from} — ${q.to}`)],
    [workbookText("تاریخ تولید (UTC)"), workbookText(generatedAt.toISOString())],
    [workbookText("تعداد ردیف‌های منبع"), { type: Number, value: data.entryCount, format: "0" }],
    [workbookText("جمع نفر-ساعت منبع"), workbookNumber(data.totalHours)],
    [
      workbookText("گروه‌بندی اول"),
      workbookText(q.groupBy ? groupLabels[q.groupBy] : "بدون گروه‌بندی"),
    ],
    [
      workbookText("گروه‌بندی دوم"),
      workbookText(q.groupBySecondary ? groupLabels[q.groupBySecondary] : "بدون گروه دوم"),
    ],
    [
      workbookText("ترتیب جزئیات"),
      workbookText(
        `${q.sort === "manHours" ? "نفر-ساعت" : groupLabels[q.sort]} / ${q.direction === "asc" ? "صعودی" : "نزولی"}`,
      ),
    ],
    [workbookText("انتساب واحد"), workbookText("واحد فعلی کارمند؛ سابقه انتقال واحد لحاظ نمی‌شود")],
    [
      workbookText("تقویم / هفته"),
      workbookText("تاریخ شمسی به صورت متن YYYY/MM/DD؛ هفته شنبه تا جمعه"),
    ],
    [
      workbookText("محدوده خروجی"),
      workbookText("تمام نتایج فیلترشده، مستقل از صفحه؛ داده‌ها در زمان تولید خوانده شده‌اند"),
    ],
    [
      workbookText("مجموع"),
      workbookText("مجموع ثابت محاسبه‌شده در سرور؛ پس از ویرایش فایل به‌روز نمی‌شود"),
    ],
  ];
  for (const dimension of ["employee", "department", "project", "projectFile"] as const)
    metadata.push([
      workbookText(groupLabels[dimension]),
      workbookText(
        q[`${dimension}Id`] ? data.filterLabels[dimension] || "فیلتر انتخاب‌شده یافت نشد" : "همه",
      ),
    ]);
  return writeExcelFile(
    [
      {
        sheet: mode === "details" ? "گزارش تفصیلی" : "خلاصه",
        data: rows,
        rightToLeft: true,
        stickyRowsCount: 1,
        columns: widths.map((width) => ({ width })),
      },
      {
        sheet: "مشخصات گزارش",
        data: metadata,
        rightToLeft: true,
        stickyRowsCount: 1,
        columns: [{ width: 38 }, { width: 85 }],
      },
    ],
    { fontFamily: "Calibri", fontSize: 11 },
  ).toBuffer();
}
