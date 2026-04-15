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
    const gstAmount = Number(((input.amount * input.gstPercent) / 100).toFixed(2));
    const total = Number((input.amount + gstAmount).toFixed(2));
    const margin = Number((input.amount - input.supplierCost).toFixed(2));

    return {
      invoiceId: `INV-${String(this.sequence++).padStart(6, "0")}`,
      bookingId: input.bookingId,
      customer: input.customer,
      amount: input.amount,
      GST: gstAmount,
      total,
      vendorPayable: input.supplierCost,
      margin,
      createdAt: new Date().toISOString(),
    };
  }
}
