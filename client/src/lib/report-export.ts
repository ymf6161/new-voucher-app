import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import writeXlsxFile from "write-excel-file/browser";
import type { CellObject, Row } from "write-excel-file/browser";
import { toDataUrl } from "./pdf-generator";
import { formatCurrency } from "./format";
import type { ReportTable } from "./report-data";
import type { CompanySettings } from "@shared/schema";

export function formatCell(value: string | number, format: ReportTable["columns"][number]["format"]): string {
  if (typeof value !== "number") return value;
  if (format === "money") return formatCurrency(value);
  return format === "number" ? value.toLocaleString("en-GB") : String(value);
}

function fileBase(table: ReportTable): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${table.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${stamp}`;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportReportCSV(table: ReportTable) {
  const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  // Money stays numeric (2dp) so the CSV opens as numbers in a spreadsheet.
  const cell = (value: string | number, i: number) =>
    typeof value === "number" && table.columns[i]?.format === "money" ? value.toFixed(2) : value;
  const lines = [
    table.columns.map((c) => quote(c.header)).join(","),
    ...table.rows.map((row) => row.map((v, i) => quote(cell(v, i))).join(",")),
    ...(table.totals ? [table.totals.map((v, i) => quote(cell(v, i))).join(",")] : []),
  ];
  triggerDownload(new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" }), `${fileBase(table)}.csv`);
}

export async function exportReportExcel(table: ReportTable) {
  const toCell = (value: string | number, i: number, bold = false): CellObject => {
    const format = table.columns[i]?.format;
    if (typeof value === "number") {
      return { value, type: Number, format: format === "money" ? "£#,##0.00" : "#,##0", fontWeight: bold ? "bold" : undefined };
    }
    return { value, type: String, fontWeight: bold ? "bold" : undefined };
  };
  const emphasis = new Set(table.emphasisRows || []);
  const data: Row[] = [
    [{ value: table.title, type: String, fontWeight: "bold", fontSize: 14 }],
    ...table.subtitle.map((line) => [{ value: line, type: String }] as Row),
    [],
    table.columns.map((c) => ({ value: c.header, type: String, fontWeight: "bold", backgroundColor: "#E5ECF8" }) as CellObject),
    ...table.rows.map((row, r) => row.map((v, i) => toCell(v, i, emphasis.has(r)))),
    ...(table.totals ? [table.totals.map((v, i) => toCell(v, i, true))] : []),
  ];
  await writeXlsxFile(data, {
    columns: table.columns.map((c) => ({ width: c.format === "text" ? 28 : 14 })),
    stickyRowsCount: table.subtitle.length + 3,
  }).toFile(`${fileBase(table)}.xlsx`);
}

export async function exportReportPDF(table: ReportTable, settings?: CompanySettings | null) {
  const landscape = table.columns.length > 6;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 14;

  if (settings?.logoUrl) {
    const logo = await toDataUrl(settings.logoUrl);
    if (logo) {
      doc.addImage(logo, "PNG", 14, 8, 24, 12);
    }
  }
  if (settings?.businessName) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(settings.businessName, pageWidth - 14, y, { align: "right" });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    if (settings.charityNumber) doc.text(`Registered Charity: ${settings.charityNumber}`, pageWidth - 14, y + 5, { align: "right" });
  }
  y = 28;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(table.title, 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  table.subtitle.forEach((line) => {
    doc.text(line, 14, y);
    y += 4.5;
  });

  const emphasis = new Set(table.emphasisRows || []);
  autoTable(doc, {
    startY: y + 2,
    head: [table.columns.map((c) => c.header)],
    body: table.rows.map((row) => row.map((v, i) => formatCell(v, table.columns[i]?.format || "text"))),
    foot: table.totals ? [table.totals.map((v, i) => formatCell(v, table.columns[i]?.format || "text"))] : undefined,
    theme: "striped",
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 8 },
    footStyles: { fillColor: [229, 236, 248], textColor: 20, fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
    didParseCell: (hook) => {
      const format = table.columns[hook.column.index]?.format;
      if (format && format !== "text") hook.cell.styles.halign = "right";
      if (hook.section === "body" && emphasis.has(hook.row.index)) hook.cell.styles.fontStyle = "bold";
    },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, 14, pageHeight - 8);
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - 14, pageHeight - 8, { align: "right" });
      doc.setTextColor(0);
    },
  });

  doc.save(`${fileBase(table)}.pdf`);
}
