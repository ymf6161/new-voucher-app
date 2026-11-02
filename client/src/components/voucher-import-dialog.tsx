import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { Name, Reference, VoucherCompany } from "@shared/schema";

type ParsedVoucher = {
  rowNumber: number;
  dateReceived: string;
  receivedFrom: string;
  reference: string;
  voucherCompany: string;
  type: "PPV" | "ACC";
  accountNumber: string;
  voucherNumber: string;
  amount: string;
  quantity: number;
  notes: string;
  errors: string[];
};

type VoucherImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: VoucherCompany[];
  names: Name[];
  references: Reference[];
  onImported: () => void;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();
const normalizeHeader = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");

function parseDelimitedText(text: string): string[][] {
  const cleanText = text.replace(/^\uFEFF/, "");
  const firstLine = cleanText.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(",") ? "," : ";";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < cleanText.length; index += 1) {
    const character = cleanText[index];
    if (quoted) {
      if (character === '"' && cleanText[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && cleanText[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("The file has an unclosed quoted field.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function parseDate(value: string): string | null {
  const dayFirst = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let year: number;
  let month: number;
  let day: number;

  if (dayFirst) {
    day = Number(dayFirst[1]);
    month = Number(dayFirst[2]);
    year = Number(dayFirst[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString();
}

function parseVouchers(text: string): ParsedVoucher[] {
  const table = parseDelimitedText(text);
  if (table.length < 2) throw new Error("The file needs a header row and at least one voucher row.");

  const headers = table[0].map(normalizeHeader);
  const column = (...aliases: string[]) => headers.findIndex((header) => aliases.includes(header));
  const columns = {
    date: column("datereceived", "receiveddate"),
    receivedFrom: column("receivedfrom", "name"),
    reference: column("reference"),
    company: column("vouchercompany", "company"),
    type: column("type", "vouchertype"),
    accountNumber: column("accountnumber"),
    voucherNumber: column("vouchernumber", "voucherno"),
    amount: column("amount"),
    quantity: column("quantity", "qty"),
    status: column("status"),
    notes: column("notes"),
  };

  const missing = [
    ["Date Received", columns.date],
    ["Voucher Company", columns.company],
    ["Type", columns.type],
    ["Amount", columns.amount],
    ["Quantity", columns.quantity],
  ].filter(([, index]) => index === -1).map(([name]) => name);
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(", ")}.`);

  const valueAt = (cells: string[], index: number) => (index < 0 ? "" : (cells[index] || "").trim());
  return table.slice(1).map((cells, index) => {
    const dateText = valueAt(cells, columns.date);
    const amountText = valueAt(cells, columns.amount).replace(/,/g, "");
    const quantityText = valueAt(cells, columns.quantity);
    const typeText = valueAt(cells, columns.type).toUpperCase();
    const statusText = valueAt(cells, columns.status).toLowerCase();
    const voucher: ParsedVoucher = {
      rowNumber: index + 2,
      dateReceived: parseDate(dateText) || "",
      receivedFrom: valueAt(cells, columns.receivedFrom),
      reference: valueAt(cells, columns.reference),
      voucherCompany: valueAt(cells, columns.company),
      type: typeText === "ACC" ? "ACC" : "PPV",
      accountNumber: valueAt(cells, columns.accountNumber),
      voucherNumber: valueAt(cells, columns.voucherNumber),
      amount: amountText,
      quantity: Number(quantityText),
      notes: valueAt(cells, columns.notes),
      errors: [],
    };

    if (!voucher.dateReceived) voucher.errors.push("Invalid date; use DD/MM/YYYY or YYYY-MM-DD.");
    if (!voucher.voucherCompany) voucher.errors.push("Voucher Company is required.");
    if (typeText !== "ACC" && typeText !== "PPV") voucher.errors.push("Type must be ACC or PPV.");
    if (!amountText || !Number.isFinite(Number(amountText)) || Number(amountText) <= 0) voucher.errors.push("Amount must be a positive number.");
    if (!Number.isInteger(voucher.quantity) || voucher.quantity < 1) voucher.errors.push("Quantity must be a positive whole number.");
    if (statusText && statusText !== "unposted") voucher.errors.push("Only unposted vouchers can be imported.");
    return voucher;
  });
}

async function resolveEntities<T extends { id: string }>(
  labels: string[],
  existing: T[],
  endpoint: string,
  field: string,
  getLabel: (item: T) => string,
): Promise<Map<string, string>> {
  const result = new Map(existing.map((item) => [normalize(getLabel(item)), item.id]));
  const uniqueLabels = [...new Map(labels.filter(Boolean).map((label) => [normalize(label), label.trim()])).values()];
  for (const label of uniqueLabels) {
    const key = normalize(label);
    if (result.has(key)) continue;
    const response = await apiRequest("POST", endpoint, { [field]: label });
    const created = await response.json();
    result.set(key, created.id);
  }
  return result;
}

export function VoucherImportDialog({ open, onOpenChange, companies, names, references, onImported }: VoucherImportDialogProps) {
  const { currentAccount } = useAuth();
  const { toast } = useToast();
  const [fileName, setFileName] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [rows, setRows] = useState<ParsedVoucher[]>([]);
  const [parseError, setParseError] = useState("");
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const validRows = rows.filter((row) => row.errors.length === 0);
  const invalidRows = rows.length - validRows.length;

  const reset = () => {
    setFileName("");
    setPastedText("");
    setRows([]);
    setParseError("");
    setImportError("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isImporting) reset();
    onOpenChange(nextOpen);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPastedText("");
    setParseError("");
    setImportError("");
    try {
      setRows(parseVouchers(await file.text()));
    } catch (error) {
      setRows([]);
      setParseError(error instanceof Error ? error.message : "Could not read this file.");
    }
    input.value = "";
  };

  const handlePastePreview = () => {
    setFileName("Pasted data");
    setParseError("");
    setImportError("");
    try {
      setRows(parseVouchers(pastedText));
    } catch (error) {
      setRows([]);
      setParseError(error instanceof Error ? error.message : "Could not parse the pasted data.");
    }
  };

  const handleImport = async () => {
    if (!currentAccount || validRows.length === 0 || invalidRows > 0) return;
    setIsImporting(true);
    setImportError("");
    try {
      const [companyIds, nameIds, referenceIds] = await Promise.all([
        resolveEntities(validRows.map((row) => row.voucherCompany), companies, "/api/voucher-companies", "name", (item) => item.name),
        resolveEntities(validRows.map((row) => row.receivedFrom), names, "/api/names", "name", (item) => item.name),
        resolveEntities(validRows.map((row) => row.reference), references, "/api/references", "reference", (item) => item.reference),
      ]);

      const vouchers = validRows.map((row) => ({
        dateReceived: row.dateReceived,
        receivedFromId: row.receivedFrom ? nameIds.get(normalize(row.receivedFrom)) : null,
        referenceId: row.reference ? referenceIds.get(normalize(row.reference)) : null,
        voucherCompanyId: companyIds.get(normalize(row.voucherCompany)),
        type: row.type,
        accountNumber: row.accountNumber || null,
        voucherNumber: row.voucherNumber || null,
        amount: row.amount,
        quantity: row.quantity,
        notes: row.notes || null,
        status: "unposted",
      }));

      const response = await apiRequest("POST", "/api/vouchers/import", { vouchers });
      const result = await response.json();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/voucher-companies"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/names"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/references"] }),
      ]);
      toast({ title: "Vouchers imported", description: `${result.imported} voucher(s) added to ${currentAccount.name}.` });
      onImported();
      handleOpenChange(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed. No voucher rows were added.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import vouchers</DialogTitle>
          <DialogDescription>
            {currentAccount ? `Importing into ${currentAccount.name}. ` : "Select an account before importing. "}
            Existing names, references, and voucher companies are matched without regard to capitalization; missing ones are created in this account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto">
          <Input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={handleFileChange} aria-label="Choose a CSV or TSV file" />
          <div className="space-y-2">
            <label htmlFor="voucher-import-paste" className="text-sm font-medium">Or paste CSV/TSV data</label>
            <Textarea
              id="voucher-import-paste"
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              placeholder="Paste the header row and voucher rows here"
              rows={4}
            />
            <Button type="button" variant="outline" size="sm" onClick={handlePastePreview} disabled={!pastedText.trim()}>
              Preview pasted data
            </Button>
          </div>
          {fileName && <p className="text-sm text-muted-foreground">{fileName}</p>}
          {parseError && <p role="alert" className="text-sm text-destructive">{parseError}</p>}
          {importError && <p role="alert" className="text-sm text-destructive">Import failed: {importError}</p>}

          {rows.length > 0 && (
            <>
              <p className="text-sm" aria-live="polite">
                {rows.length} row(s) found; {validRows.length} ready to import; {invalidRows} with errors.
                {invalidRows > 0 && " Fix the source file and select it again before importing."}
              </p>
              <div className="max-h-72 overflow-auto rounded border">
                <table className="w-full min-w-[1050px] text-left text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>{["Row", "Date", "Received from", "Reference", "Company", "Type", "Voucher #", "Amount", "Qty", "Notes", "Validation"].map((heading) => <th key={heading} className="px-2 py-2 font-medium">{heading}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((row) => (
                      <tr key={row.rowNumber} className="border-t align-top">
                        <td className="px-2 py-2">{row.rowNumber}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{row.dateReceived ? row.dateReceived.slice(0, 10) : "Invalid"}</td>
                        <td className="px-2 py-2">{row.receivedFrom || "-"}</td>
                        <td className="px-2 py-2">{row.reference || "-"}</td>
                        <td className="px-2 py-2">{row.voucherCompany || "-"}</td>
                        <td className="px-2 py-2">{row.type}</td>
                        <td className="px-2 py-2">{row.voucherNumber || "-"}</td>
                        <td className="px-2 py-2">{row.amount}</td>
                        <td className="px-2 py-2">{Number.isFinite(row.quantity) ? row.quantity : "-"}</td>
                        <td className="px-2 py-2">{row.notes || "-"}</td>
                        <td className="px-2 py-2 text-destructive">{row.errors.join(" ") || "Ready"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && <p className="text-xs text-muted-foreground">Showing 8 of {rows.length} rows.</p>}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isImporting}>Cancel</Button>
          <Button onClick={handleImport} disabled={!currentAccount || validRows.length === 0 || invalidRows > 0 || isImporting}>
            <FileUp className="mr-2 h-4 w-4" />
            {isImporting ? "Importing..." : `Import ${validRows.length} voucher(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}