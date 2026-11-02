export function downloadCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) {
    console.warn("No data to export");
    return;
  }

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];

  csvRows.push(headers.map(h => `"${h}"`).join(","));

  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '""';
      }
      if (typeof value === "string") {
        return `"${value.replace(/"/g, '""')}"`;
      }
      if (value instanceof Date) {
        return `"${value.toISOString()}"`;
      }
      return `"${String(value)}"`;
    });
    csvRows.push(values.join(","));
  }

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function formatVouchersForExport(vouchers: any[], names: any[], companies: any[], references: any[]): Record<string, unknown>[] {
  return vouchers.map(v => {
    const name = names.find(n => n.id === v.receivedFromId);
    const company = companies.find(c => c.id === v.voucherCompanyId);
    const reference = references.find(r => r.id === v.referenceId);
    
    return {
      "Date Received": new Date(v.dateReceived).toLocaleDateString("en-GB"),
      "Received From": name?.name || "",
      "Reference": reference?.reference || "",
      "Voucher Company": company?.name || "",
      "Type": v.type,
      "Account Number": v.accountNumber || "",
      "Voucher Number": v.voucherNumber || "",
      "Amount": parseFloat(v.amount) || 0,
      "Quantity": v.quantity,
      "Status": v.status,
      "Notes": v.notes || "",
    };
  });
}

export function formatBatchesForExport(batches: any[]): Record<string, unknown>[] {
  return batches.map(b => {
    return {
      "Reference": b.reference,
      "Batch Date": new Date(`${b.batchDate || b.dateSent}`).toLocaleDateString("en-GB"),
      "Sent To": b.recipient?.name || b.voucherCompany?.name || "",
      "Companies": (b.companyNames || [b.voucherCompany?.name].filter(Boolean)).join(", "),
      "Quantity": (b.vouchers || []).reduce((sum: number, v: any) => sum + (v.quantity || 0), 0),
      "Amount Sent": parseFloat(b.amountSent) || 0,
      "Status": b.status,
      "Notes": b.notes || "",
    };
  });
}

export function formatDepositsForExport(deposits: any[], banks: any[]): Record<string, unknown>[] {
  return deposits.map(d => {
    const bank = d.bank || banks.find(b => b.id === d.bankId);
    return {
      "Date": new Date(d.dateDeposited).toLocaleDateString("en-GB"),
      "Reference": d.reference || "",
      "From": d.recipient?.name || d.voucherCompany?.name || "",
      "Bank": bank?.name || "",
      "Account": bank?.accountNumber || "",
      "Quantity": (d.vouchers || []).reduce((sum: number, v: any) => sum + (v.quantity || 0), 0),
      "Amount Banked": parseFloat(d.amountBanked) || 0,
      "Notes": d.notes || "",
    };
  });
}
