export type PaymentGateway = "RAZORPAY" | "STRIPE";
export type PaymentStatus = "initiated" | "authorized" | "captured" | "failed" | "verified";

export interface PaymentIntentRequest {
  tenantId: string;
  bookingId: string;
  amount: number;
  currency: string;
  customerLayer: "B2C" | "B2B" | "CORPORATE";
  countryCode?: string;
}

export interface PaymentRecord {
  paymentId: string;
  tenantId: string;
  bookingId: string;
  amount: number;
  currency: string;
  paymentGateway: PaymentGateway;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

interface PaymentGatewayClient {
  createIntent(input: PaymentIntentRequest): Promise<{ gatewayPaymentId: string }>;
  capture(paymentId: string, amount: number): Promise<{ status: PaymentStatus }>;
  verify(paymentId: string, signature: string): Promise<{ valid: boolean }>;
}

export class PaymentService {
  private readonly paymentStore = new Map<string, PaymentRecord>();
  private sequence = 1;

  constructor(
    private readonly razorpayClient: PaymentGatewayClient,
    private readonly stripeClient: PaymentGatewayClient,
  ) {}

  async createPaymentIntent(input: PaymentIntentRequest): Promise<PaymentRecord> {
    const gateway = input.countryCode === "IN" ? "RAZORPAY" : "STRIPE";
    const client = gateway === "RAZORPAY" ? this.razorpayClient : this.stripeClient;
    const gatewayResult = await client.createIntent(input);

    const now = new Date().toISOString();
    const record: PaymentRecord = {
      paymentId: gatewayResult.gatewayPaymentId || `PAY-${String(this.sequence++).padStart(6, "0")}`,
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      amount: input.amount,
      currency: input.currency,
      paymentGateway: gateway,
      paymentStatus: "initiated",
      createdAt: now,
      updatedAt: now,
    };

    this.paymentStore.set(record.paymentId, record);
    return record;
  }

  async capturePayment(paymentId: string): Promise<PaymentRecord> {
    const payment = this.requirePayment(paymentId);
    const client = payment.paymentGateway === "RAZORPAY" ? this.razorpayClient : this.stripeClient;
    const result = await client.capture(paymentId, payment.amount);
    payment.paymentStatus = result.status;
    payment.updatedAt = new Date().toISOString();
    return payment;
  }

  async verifyPayment(paymentId: string, signature: string): Promise<PaymentRecord> {
    const payment = this.requirePayment(paymentId);
    const client = payment.paymentGateway === "RAZORPAY" ? this.razorpayClient : this.stripeClient;
    const result = await client.verify(paymentId, signature);
    payment.paymentStatus = result.valid ? "verified" : "failed";
    payment.updatedAt = new Date().toISOString();
    return payment;
  }

  getPayment(paymentId: string): PaymentRecord {
    return this.requirePayment(paymentId);
  }

  listFailedPayments(tenantId: string): PaymentRecord[] {
    return [...this.paymentStore.values()].filter((payment) => payment.tenantId === tenantId && payment.paymentStatus === "failed");
  }

  private requirePayment(paymentId: string): PaymentRecord {
    const payment = this.paymentStore.get(paymentId);
    if (!payment) {
      throw new Error(`Payment not found: ${paymentId}`);
    }
    return payment;
  }
}
