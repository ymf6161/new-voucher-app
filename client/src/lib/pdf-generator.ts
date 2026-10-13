import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDate } from "./format";
import type { BatchWithRelations, VoucherWithRelations, CompanySettings } from "@shared/schema";

interface RemittanceData {
  batch: BatchWithRelations;
  vouchers: VoucherWithRelations[];
  settings?: CompanySettings | null;
}

interface RemittanceRow {
  voucherLabel: string;
  unitAmount: number;
  quantity: number;
  total: number;
}

/** PPV vouchers are summed per unit amount; ACC vouchers are listed individually. */
function buildRemittanceRows(vouchers: VoucherWithRelations[]): RemittanceRow[] {
  const ppvGroups = new Map<number, RemittanceRow>();
  const accRows: RemittanceRow[] = [];

  for (const voucher of vouchers) {
    const unitAmount = parseFloat(String(voucher.amount || "0"));
    const total = unitAmount * voucher.quantity;

    if (voucher.type === "ACC") {
      accRows.push({ voucherLabel: voucher.voucherNumber || "ACC", unitAmount, quantity: voucher.quantity, total });
      continue;
    }

    const existingGroup = ppvGroups.get(unitAmount);
    if (existingGroup) {
      existingGroup.quantity += voucher.quantity;
      existingGroup.total += total;
      continue;
    }

    ppvGroups.set(unitAmount, { voucherLabel: "PPV", unitAmount, quantity: voucher.quantity, total });
  }

  return [
    ...Array.from(ppvGroups.values()).sort((a, b) => a.unitAmount - b.unitAmount),
    ...accRows.sort((a, b) =>
      a.unitAmount !== b.unitAmount ? a.unitAmount - b.unitAmount : a.voucherLabel.localeCompare(b.voucherLabel),
    ),
  ];
}

function splitAddressLines(value?: string | null): string[] {
  if (!value) return [];

  return value
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function toDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();

    // Convert any supported image format into PNG to keep jsPDF addImage stable.
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = objectUrl;
      });

      if (!img) return null;

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

export async function generateRemittancePDF(data: RemittanceData): Promise<jsPDF> {
  const { batch, vouchers, settings } = data;
  const doc = new jsPDF();

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const topMargin = 20;
  const bottomMargin = 20;
  let yPos = 15;

  const ensureSpace = (requiredHeight: number) => {
    if (yPos + requiredHeight <= pageHeight - bottomMargin) return;
    doc.addPage();
    yPos = topMargin;
  };

  // DL envelope window safe area (for typical 110x220 with left window)
  const windowX = 22;
  const windowY = 48;
  const windowWidth = 88;
  const windowHeight = 32;

  // Sender header
  const logoWidth = 24;
  const logoHeight = 12;
  const headerCenterX = pageWidth / 2;
  const logoY = 10;
  let headerStartY = 15;

  if (settings?.logoUrl) {
    const logoDataUrl = await toDataUrl(settings.logoUrl);
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", headerCenterX - logoWidth / 2, logoY, logoWidth, logoHeight);
      headerStartY = logoY + logoHeight + 4;
    }
  }

  yPos = headerStartY;
  if (settings?.businessName) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(settings.businessName, headerCenterX, yPos, { align: "center" });
    yPos += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const senderAddressLines = splitAddressLines(settings.address);
    for (const line of senderAddressLines.slice(0, 2)) {
      doc.text(line, headerCenterX, yPos, { align: "center" });
      yPos += 4;
    }

    const addressParts: string[] = [];
    if (settings.city) addressParts.push(settings.city);
    if (settings.postcode) addressParts.push(settings.postcode);
    if (addressParts.length > 0) {
      doc.text(addressParts.join(" "), headerCenterX, yPos, { align: "center" });
      yPos += 4;
    }

    if (settings.charityNumber) {
      doc.text(`Registered Charity: ${settings.charityNumber}`, headerCenterX, yPos, { align: "center" });
      yPos += 4;
    }

    const contactParts: string[] = [];
    if (settings.phone) contactParts.push(`Tel: ${settings.phone}`);
    if (settings.email) contactParts.push(`Email: ${settings.email}`);
    if (contactParts.length > 0) {
      doc.text(contactParts.join("   |   "), headerCenterX, yPos, { align: "center" });
      yPos += 4;
    }

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(20, yPos, pageWidth - 20, yPos);
  }

  // Recipient in window box (kept inside safe printable bounds)
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.2);
  doc.rect(windowX, windowY, windowWidth, windowHeight);

  // A batch to a person is addressed to them; otherwise to the voucher company.
  const addressee: { name: string; address?: string | null; city?: string | null; postcode?: string | null } | null =
    batch.recipient || batch.voucherCompany || null;
  if (addressee) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    let addressY = windowY + 6;
    const lineX = windowX + 3;
    const maxAddressY = windowY + windowHeight - 3;

    const printAddressLine = (line: string) => {
      if (addressY > maxAddressY) return;
      doc.text(line, lineX, addressY);
      addressY += 5;
    };

    printAddressLine(addressee.name);

    const recipientAddressLines = splitAddressLines(addressee.address);
    for (const line of recipientAddressLines.slice(0, 3)) {
      printAddressLine(line);
    }

    if (addressee.city) {
      printAddressLine(addressee.city);
    }

    if (addressee.postcode) {
      printAddressLine(addressee.postcode);
    }
  }

  // Title
  yPos = 93;
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("REMITTANCE ADVICE", pageWidth / 2, yPos, { align: "center" });
  yPos += 12;

  // Batch details
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const leftCol = 20;
  const rightCol = pageWidth / 2 + 10;

  doc.setFont("helvetica", "bold");
  doc.text("Reference:", leftCol, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(batch.reference, leftCol + 25, yPos);

  doc.setFont("helvetica", "bold");
  doc.text("Date:", rightCol, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(formatDate(batch.batchDate || batch.dateSent), rightCol + 15, yPos);
  yPos += 15;

  const activeVouchers = vouchers.filter((v) => v.status !== "cancelled");

  // Vouchers grouped by company; a batch to a person can span several companies.
  const companySections = new Map<string, { name: string; vouchers: VoucherWithRelations[] }>();
  for (const voucher of activeVouchers) {
    const section = companySections.get(voucher.voucherCompanyId) || {
      name: voucher.voucherCompany?.name || batch.voucherCompany?.name || "",
      vouchers: [],
    };
    section.vouchers.push(voucher);
    companySections.set(voucher.voucherCompanyId, section);
  }
  const multiCompany = companySections.size > 1;

  const tableData: any[] = [];
  let rowNumber = 0;
  for (const section of Array.from(companySections.values()).sort((a, b) => a.name.localeCompare(b.name))) {
    const rows = buildRemittanceRows(section.vouchers);
    if (multiCompany) {
      const sectionQty = rows.reduce((sum, row) => sum + row.quantity, 0);
      const sectionTotal = rows.reduce((sum, row) => sum + row.total, 0);
      tableData.push([
        {
          content: `${section.name}   (Qty ${sectionQty} - ${formatCurrency(sectionTotal)})`,
          colSpan: 5,
          styles: { fontStyle: "bold", fillColor: [229, 236, 248], halign: "left" },
        },
      ]);
    }
    for (const row of rows) {
      rowNumber += 1;
      tableData.push([
        rowNumber.toString(),
        row.voucherLabel,
        formatCurrency(row.unitAmount.toString()),
        row.quantity.toString(),
        formatCurrency(row.total.toString()),
      ]);
    }
  }

  autoTable(doc, {
    startY: yPos,
    head: [["#", "Voucher No.", "Unit Amount", "Qty", "Total"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 10,
    },
    bodyStyles: {
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 15, halign: "center" },
      1: { cellWidth: 35, halign: "center" },
      2: { cellWidth: 45, halign: "right" },
      3: { cellWidth: 25, halign: "center" },
      4: { cellWidth: 55, halign: "right" },
    },
    margin: { left: 20, right: 20 },
    didParseCell: (hookData) => {
      if (hookData.section !== "head") return;

      const headAlignments: Record<number, "center" | "right"> = {
        0: "center",
        1: "center",
        2: "right",
        3: "center",
        4: "right",
      };

      hookData.cell.styles.halign = headAlignments[hookData.column.index] || "center";
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
  yPos = finalY + 10;

  const totalQuantity = activeVouchers.reduce((sum, v) => sum + v.quantity, 0);
  const totalSummaryHeight = 29;

  const bankDetailLines = batch.bank
    ? [
        `Account Name: ${batch.bank.name}`,
        ...(batch.bank.accountNumber ? [`Account Number: ${batch.bank.accountNumber}`] : []),
        ...(batch.bank.sortCode ? [`Sort Code: ${batch.bank.sortCode}`] : []),
      ]
    : [];

  const bankBoxHeight = batch.bank ? 19 + bankDetailLines.length * 5 + 5 : 0;

  ensureSpace(totalSummaryHeight + (bankBoxHeight > 0 ? bankBoxHeight + 10 : 0));

  // Total summary
  doc.setDrawColor(200, 200, 200);
  doc.line(pageWidth - 80, yPos, pageWidth - 20, yPos);
  yPos += 7;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Total Quantity:", pageWidth - 80, yPos);
  doc.text(totalQuantity.toString(), pageWidth - 20, yPos, { align: "right" });
  yPos += 7;

  doc.text("Total Amount:", pageWidth - 80, yPos);
  doc.text(formatCurrency(batch.amountSent), pageWidth - 20, yPos, { align: "right" });
  yPos += 15;

  // Bank details section
  if (batch.bank) {
    ensureSpace(bankBoxHeight);

    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.5);
    doc.rect(20, yPos, pageWidth - 40, bankBoxHeight);
    yPos += 7;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Please remit payment to:", 25, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    for (const line of bankDetailLines) {
      doc.text(line, 25, yPos);
      yPos += 5;
    }

    yPos += 10;
  }

  // Notes
  if (batch.notes) {
    const splitNotes = doc.splitTextToSize(batch.notes, pageWidth - 40);
    const notesHeight = 10 + splitNotes.length * 5;
    ensureSpace(notesHeight);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Notes:", 20, yPos);
    yPos += 5;
    doc.setFont("helvetica", "normal");
    doc.text(splitNotes, 20, yPos);
  }

  return doc;
}

export async function downloadRemittancePDF(data: RemittanceData): Promise<void> {
  const doc = await generateRemittancePDF(data);
  const batchDate = data.batch.batchDate || data.batch.dateSent;
  const filename = `remittance-${data.batch.reference}-${formatDate(batchDate).replace(/\//g, "-")}.pdf`;
  doc.save(filename);
}
