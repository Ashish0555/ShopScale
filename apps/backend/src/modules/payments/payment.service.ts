import createHttpError from "http-errors";
import { hashPaymentRequestBody } from "./payment.repository.js";
import type { CreatePaymentInput, Payment, PaymentRepository } from "./payment.types.js";

export class PaymentService {
  constructor(private readonly repository: PaymentRepository) {}

  async createPayment(input: {
    userId: string;
    idempotencyKey: string | undefined;
    method: string;
    path: string;
    body: CreatePaymentInput;
  }): Promise<{ status: number; body: unknown; replayed: boolean }> {
    const idempotencyKey = input.idempotencyKey?.trim();

    if (!idempotencyKey) {
      throw createHttpError(400, "Idempotency-Key header is required");
    }

    if (idempotencyKey.length > 255) {
      throw createHttpError(400, "Idempotency-Key header is too long");
    }

    return this.repository.createPaymentWithIdempotency({
      userId: input.userId,
      idempotencyKey,
      method: input.method,
      path: input.path,
      requestHash: hashPaymentRequestBody(input.body),
      orderId: input.body.orderId,
      simulateFailure: input.body.simulateFailure ?? false
    });
  }

  async getPayment(paymentId: string, userId: string): Promise<Payment> {
    const payment = await this.repository.findPaymentForUser(paymentId, userId);

    if (!payment) {
      throw createHttpError(404, "Payment not found");
    }

    return payment;
  }
}
