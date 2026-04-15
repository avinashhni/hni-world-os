import * as fs from "node:fs";
import * as path from "node:path";

export interface PersistentBookingRecord {
  tenantId: string;
  bookingId: string;
  status: string;
  stage: string;
  paymentId?: string;
  paymentStatus?: string;
  paymentGateway?: string;
  supplier: string;
  sellAmount: number;
  costAmount: number;
  marginAmount: number;
  createdAt: string;
}

export interface PersistentPaymentRecord {
  tenantId: string;
  paymentId: string;
  bookingId: string;
  paymentGateway: string;
  paymentStatus: string;
  amount: number;
  currency: string;
  updatedAt: string;
}

export interface PersistentSupplierRecord {
  tenantId: string;
  supplierCode: string;
  status: string;
  healthy: boolean;
  updatedAt: string;
}

export interface PersistentInvoiceRecord {
  tenantId: string;
  invoiceId: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  amount: number;
  gst: number;
  total: number;
  margin: number;
  createdAt: string;
}

interface UttPersistentState {
  bookings: PersistentBookingRecord[];
  payments: PersistentPaymentRecord[];
  suppliers: PersistentSupplierRecord[];
  invoices: PersistentInvoiceRecord[];
}

const EMPTY_STATE: UttPersistentState = {
  bookings: [],
  payments: [],
  suppliers: [],
  invoices: [],
};

export class UttPersistenceService {
  private readonly filePath: string;

  constructor(rootDir = process.cwd()) {
    this.filePath = path.join(rootDir, "backend/apps/muski-core-runtime/data/utt-persistence.json");
    this.ensurePersistenceFile();
  }

  upsertBooking(record: PersistentBookingRecord): void {
    const state = this.readState();
    state.bookings = [...state.bookings.filter((item) => !(item.tenantId === record.tenantId && item.bookingId === record.bookingId)), record];
    this.writeState(state);
  }

  upsertPayment(record: PersistentPaymentRecord): void {
    const state = this.readState();
    state.payments = [
      ...state.payments.filter(
        (item) =>
          !(item.tenantId === record.tenantId && item.paymentId === record.paymentId) &&
          !(item.tenantId === record.tenantId && item.bookingId === record.bookingId),
      ),
      record,
    ];
    this.writeState(state);
  }

  upsertSupplier(record: PersistentSupplierRecord): void {
    const state = this.readState();
    state.suppliers = [...state.suppliers.filter((item) => !(item.tenantId === record.tenantId && item.supplierCode === record.supplierCode)), record];
    this.writeState(state);
  }

  upsertInvoice(record: PersistentInvoiceRecord): void {
    const state = this.readState();
    state.invoices = [
      ...state.invoices.filter(
        (item) =>
          !(item.tenantId === record.tenantId && item.invoiceId === record.invoiceId) &&
          !(item.tenantId === record.tenantId && item.bookingId === record.bookingId),
      ),
      record,
    ];
    this.writeState(state);
  }

  getState(): UttPersistentState {
    return this.readState();
  }

  getPaymentByBooking(tenantId: string, bookingId: string): PersistentPaymentRecord | undefined {
    return this.readState().payments.find((payment) => payment.tenantId === tenantId && payment.bookingId === bookingId);
  }

  getInvoiceByBooking(tenantId: string, bookingId: string): PersistentInvoiceRecord | undefined {
    return this.readState().invoices.find((invoice) => invoice.tenantId === tenantId && invoice.bookingId === bookingId);
  }

  private ensurePersistenceFile(): void {
    if (!fs.existsSync(this.filePath)) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(EMPTY_STATE, null, 2));
    }
  }

  private readState(): UttPersistentState {
    const raw = fs.readFileSync(this.filePath, "utf-8");
    if (!raw.trim()) {
      return { ...EMPTY_STATE };
    }

    const parsed = JSON.parse(raw) as Partial<UttPersistentState>;
    return {
      bookings: parsed.bookings ?? [],
      payments: parsed.payments ?? [],
      suppliers: parsed.suppliers ?? [],
      invoices: parsed.invoices ?? [],
    };
  }

  private writeState(state: UttPersistentState): void {
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }
}
