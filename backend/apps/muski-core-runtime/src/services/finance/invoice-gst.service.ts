export interface InvoiceInput {
  tenantId: string;
  bookingId: string;
  customer: {
    customerId: string;
    name: string;
  };
  amount: number;
  gstPercent: number;
  supplierCost: number;
}

export interface InvoiceRecord {
  invoiceId: string;
  tenantId: string;
  bookingId: string;
  customer: {
    customerId: string;
    name: string;
  };
  amount: number;
  GST: number;
  total: number;
  vendorPayable: number;
  margin: number;
  createdAt: string;
}

export class InvoiceGstService {
  private sequence = 1;
  private readonly invoiceByTenantBooking = new Map<string, InvoiceRecord>();

  generateInvoice(input: InvoiceInput): InvoiceRecord {
    const bookingKey = this.tenantBookingKey(input.tenantId, input.bookingId);
    const existingInvoice = this.invoiceByTenantBooking.get(bookingKey);
    if (existingInvoice) {
      return existingInvoice;
    }

    const amount = this.roundTo2(input.amount);
    const supplierCost = this.roundTo2(input.supplierCost);
    const gstAmount = this.roundTo2((amount * input.gstPercent) / 100);
    const total = this.roundTo2(amount + gstAmount);
    const margin = this.roundTo2(amount - supplierCost);

    const invoice: InvoiceRecord = {
      invoiceId: `INV-${String(this.sequence++).padStart(6, "0")}`,
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      customer: input.customer,
      amount,
      GST: gstAmount,
      total,
      vendorPayable: supplierCost,
      margin,
      createdAt: new Date().toISOString(),
    };
    this.invoiceByTenantBooking.set(bookingKey, invoice);
    return invoice;
  }

  getInvoiceByBooking(tenantId: string, bookingId: string): InvoiceRecord | undefined {
    return this.invoiceByTenantBooking.get(this.tenantBookingKey(tenantId, bookingId));
  }

  private roundTo2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private tenantBookingKey(tenantId: string, bookingId: string): string {
    return `${tenantId}::${bookingId}`;
  }
}
