import { z } from "zod";

export type User = {
  id: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role: string;
  created_at?: string;
};

export type VoucherCompany = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
};

export type InsertVoucherCompany = Omit<VoucherCompany, 'id'>;

export type Name = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export type InsertName = Omit<Name, 'id'>;

export type Reference = {
  id: string;
  reference: string;
  notes: string | null;
  contact: string | null;
};

export type InsertReference = Omit<Reference, 'id'>;

export type Bank = {
  id: string;
  name: string;
  accountNumber: string | null;
  sortCode: string | null;
  isArchived: boolean;
  archivedAt: Date | null;
};

export type InsertBank = Omit<Bank, 'id'>;

export const voucherStatusEnum = z.enum([
  "unposted",
  "posted",
  "deposited",
  "cancelled",
  "completed"
]);
export type VoucherStatus = z.infer<typeof voucherStatusEnum>;

export const voucherTypeEnum = z.enum(["PPV", "ACC"]);
export type VoucherType = z.infer<typeof voucherTypeEnum>;

export type Voucher = {
  id: string;
  dateReceived: Date;
  receivedFromId: string | null;
  referenceId: string | null;
  voucherCompanyId: string;
  type: string;
  accountNumber: string | null;
  voucherNumber: string | null;
  amount: string;
  quantity: number;
  notes: string | null;
  status: string;
  batchId: string | null;
  depositId: string | null;
};

export type InsertVoucher = Omit<Voucher, 'id'>;

export type VoucherWithRelations = Voucher & {
  receivedFrom?: Name;
  reference?: Reference;
  voucherCompany: VoucherCompany;
};

export const batchStatusEnum = z.enum(["pending", "sent", "cancelled"]);
export type BatchStatus = z.infer<typeof batchStatusEnum>;

export type Batch = {
  id: string;
  dateSent: Date;
  batchDate: Date;
  reference: string;
  /** Null when the batch goes to a recipient and spans several companies. */
  voucherCompanyId: string | null;
  recipientNameId?: string | null;
  amountSent: string;
  status: string;
  notes: string | null;
  bankId: string | null;
};

export type InsertBatch = Omit<Batch, 'id'>;

export type BatchWithRelations = Batch & {
  voucherCompany: VoucherCompany | null;
  recipient?: Name | null;
  companyNames?: string[];
  bank?: Bank | null;
  vouchers: Voucher[];
};

export type Deposit = {
  id: string;
  dateDeposited: Date;
  bankId: string;
  voucherCompanyId: string | null;
  recipientNameId?: string | null;
  amountBanked: string;
  reference: string | null;
  notes: string | null;
};

export type InsertDeposit = Omit<Deposit, 'id'>;

export type DepositWithRelations = Deposit & {
  bank: Bank;
  voucherCompany: VoucherCompany | null;
  recipient?: Name | null;
  vouchers: Voucher[];
};

export type CompanySettings = {
  id: string;
  businessName: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  charityNumber: string | null;
};

export type InsertCompanySettings = Omit<CompanySettings, 'id'>;

export type DashboardStats = {
  totalUnposted: number;
  totalUnpostedAmount: string;
  totalPosted: number;
  totalPostedAmount: string;
  totalDeposited: number;
  totalDepositedAmount: string;
  byStatus: Record<"unposted" | "posted" | "deposited", StatsBucket>;
  thisMonth: StatsBucket;
  /** Last six months of vouchers received (excluding cancelled), oldest first; month = "YYYY-MM". */
  monthly: (StatsBucket & { month: string })[];
  recentVouchers: VoucherWithRelations[];
  pendingBatches: BatchWithRelations[];
};

export type StatsBucket = { count: number; quantity: number; value: number };
