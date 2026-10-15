export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(num);
}

export function formatDate(date: Date | string): string {
  const dateOnly = typeof date === "string" ? date.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Who a batch or deposit went to: the recipient (with the companies it covered) or the voucher company. */
export function batchSentTo(batch: {
  recipient?: { name: string } | null;
  voucherCompany?: { name: string } | null;
  companyNames?: string[];
}): string {
  if (batch.recipient) {
    return batch.companyNames?.length ? `${batch.recipient.name} (${batch.companyNames.join(", ")})` : batch.recipient.name;
  }
  return batch.voucherCompany?.name || "";
}

export function generateDepositReference(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DEP-${year}${month}${day}-${random}`;
}
