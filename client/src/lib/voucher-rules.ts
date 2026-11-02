import type { Voucher } from "@shared/schema";

// Mirrors the database rule in vf_guard_voucher_writes (see
// supabase/migrations/20261102160000_edit_details_of_posted_vouchers.sql).

/** Fields that can be changed on any voucher, even one that is posted or banked. */
export const ALWAYS_EDITABLE_FIELDS = ["receivedFromId", "referenceId", "notes"] as const;

/** Unposted, cancelled or completed vouchers outside any batch or deposit can be fully edited or deleted. */
export function isVoucherFullyEditable(voucher: Pick<Voucher, "status" | "batchId" | "depositId">): boolean {
  return ["unposted", "cancelled", "completed"].includes(voucher.status) && !voucher.batchId && !voucher.depositId;
}

/** True when a set of changed fields only touches the always-editable ones. */
export function onlyAlwaysEditable(fields: string[]): boolean {
  return fields.length > 0 && fields.every((f) => (ALWAYS_EDITABLE_FIELDS as readonly string[]).includes(f));
}
