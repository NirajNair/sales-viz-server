export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const ValidationError = (message: string) =>
  new AppError(message, 400, "VALIDATION_ERROR");

export const InternalServerError = (message: string) =>
  new AppError(message, 500, "INTERNAL_SERVER_ERROR");

export const NotFoundError = (message: string) =>
  new AppError(message, 404, "NOT_FOUND_ERROR");

export const ServiceUnavailableError = (message: string, code: string = "SERVICE_UNAVAILABLE") =>
  new AppError(message, 503, code);

export const BadGatewayError = (
  message: string,
  code: string = "BAD_GATEWAY",
) => new AppError(message, 502, code);
