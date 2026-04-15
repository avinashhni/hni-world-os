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

  generateInvoice(input: InvoiceInput): InvoiceRecord {
    const amount = this.roundTo2(input.amount);
    const supplierCost = this.roundTo2(input.supplierCost);
    const gstAmount = this.roundTo2((amount * input.gstPercent) / 100);
    const total = this.roundTo2(amount + gstAmount);
    const margin = this.roundTo2(amount - supplierCost);

    return {
      invoiceId: `INV-${String(this.sequence++).padStart(6, "0")}`,
      bookingId: input.bookingId,
      customer: input.customer,
      amount,
      GST: gstAmount,
      total,
      vendorPayable: supplierCost,
      margin,
      createdAt: new Date().toISOString(),
    };
  }

  private roundTo2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
