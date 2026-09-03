import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import createHttpError from "http-errors";
import { writeOutboxEvent } from "../../infrastructure/kafka/outbox.js";
import type { Payment, PaymentRepository } from "./payment.types.js";

type PaymentModel = Prisma.PaymentGetPayload<Record<string, never>>;

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createPaymentWithIdempotency(input: {
    userId: string;
    idempotencyKey: string;
    method: string;
    path: string;
    requestHash: string;
    orderId: string;
    simulateFailure: boolean;
  }): Promise<{ status: number; body: unknown; replayed: boolean }> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        userId_key_method_path: {
          userId: input.userId,
          key: input.idempotencyKey,
          method: input.method,
          path: input.path
        }
      }
    });

    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        throw createHttpError(409, "Idempotency key was already used with a different request");
      }

      return {
        status: existing.responseStatus,
        body: existing.responseBody,
        replayed: true
      };
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const order = await transaction.order.findFirst({
          where: {
            id: input.orderId,
            userId: input.userId
          }
        });

        if (!order) {
          throw createHttpError(404, "Order not found");
        }

        if (order.state === "CANCELLED") {
          throw createHttpError(409, "Cannot pay for a cancelled order");
        }

        const payment = await transaction.payment.create({
          data: {
            userId: input.userId,
            orderId: order.id,
            amountCents: order.totalCents,
            currency: order.currency,
            state: input.simulateFailure ? "FAILED" : "SUCCESS",
            providerRef: `sim_${randomUUID()}`,
            failureReason: input.simulateFailure ? "Simulated payment failure" : null
          }
        });
        const status = input.simulateFailure ? 402 : 201;
        const body = { payment: mapPayment(payment) };

        await writeOutboxEvent(transaction, {
          type: input.simulateFailure ? "PaymentFailed" : "PaymentSucceeded",
          aggregateType: "payment",
          aggregateId: payment.id,
          payload: input.simulateFailure
            ? {
                paymentId: payment.id,
                orderId: order.id,
                userId: input.userId,
                amountCents: payment.amountCents,
                reason: payment.failureReason ?? "Payment failed"
              }
            : {
                paymentId: payment.id,
                orderId: order.id,
                userId: input.userId,
                amountCents: payment.amountCents
              }
        });

        await transaction.idempotencyKey.create({
          data: {
            userId: input.userId,
            key: input.idempotencyKey,
            method: input.method,
            path: input.path,
            requestHash: input.requestHash,
            responseStatus: status,
            responseBody: body
          }
        });

        return {
          status,
          body,
          replayed: false
        };
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.prisma.idempotencyKey.findUnique({
          where: {
            userId_key_method_path: {
              userId: input.userId,
              key: input.idempotencyKey,
              method: input.method,
              path: input.path
            }
          }
        });

        if (replay && replay.requestHash === input.requestHash) {
          return {
            status: replay.responseStatus,
            body: replay.responseBody,
            replayed: true
          };
        }
      }

      throw error;
    }
  }

  async findPaymentForUser(paymentId: string, userId: string): Promise<Payment | null> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        userId
      }
    });

    return payment ? mapPayment(payment) : null;
  }
}

export function hashPaymentRequestBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortJson(body))).digest("hex");
}

function mapPayment(payment: PaymentModel): Payment {
  return {
    id: payment.id,
    userId: payment.userId,
    orderId: payment.orderId,
    amountCents: payment.amountCents,
    currency: payment.currency,
    state: payment.state,
    providerRef: payment.providerRef,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
  };
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)])
    );
  }

  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
