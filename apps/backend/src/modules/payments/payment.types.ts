export type PaymentState = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";

export type Payment = {
  id: string;
  userId: string;
  orderId: string;
  amountCents: number;
  currency: string;
  state: PaymentState;
  providerRef: string;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePaymentInput = {
  orderId: string;
  simulateFailure?: boolean;
};

export type StoredIdempotencyResult = {
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
};

export type PaymentRepository = {
  createPaymentWithIdempotency(input: {
    userId: string;
    idempotencyKey: string;
    method: string;
    path: string;
    requestHash: string;
    orderId: string;
    simulateFailure: boolean;
  }): Promise<{ status: number; body: unknown; replayed: boolean }>;
  findPaymentForUser(paymentId: string, userId: string): Promise<Payment | null>;
};
