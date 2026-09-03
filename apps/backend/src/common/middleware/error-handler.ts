import type { ErrorRequestHandler, RequestHandler } from "express";
import createHttpError, { isHttpError } from "http-errors";
import { logger } from "../../infrastructure/logging/logger.js";

type ErrorResponse = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
};

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    default:
      return "INTERNAL_SERVER_ERROR";
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(createHttpError(404, `Route ${req.method} ${req.originalUrl} was not found`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  void next;

  const requestId = String(res.locals.requestId ?? "unknown");
  const httpError = isHttpError(error) ? error : createHttpError(500, "Unexpected server error");
  const status = httpError.statusCode >= 500 ? 500 : httpError.statusCode;

  if (status >= 500) {
    logger.error({ err: error, requestId }, "Unhandled request error");
  }

  const response: ErrorResponse = {
    error: {
      code: statusToCode(status),
      message: status >= 500 ? "Unexpected server error" : httpError.message,
      requestId
    }
  };

  if (status < 500 && "details" in httpError) {
    response.error.details = httpError.details;
  }

  res.status(status).json(response);
};
