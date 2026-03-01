/**
 * Error classes for the Finault SDK
 */

export interface ErrorResponse {
  error?: {
    message: string;
    code?: string;
  };
  field_errors?: Record<string, string>;
  retry_after?: number;
}

export class FinaultError extends Error {
  public readonly statusCode?: number;
  public readonly errorCode?: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      errorCode?: string;
      requestId?: string;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options?.statusCode;
    this.errorCode = options?.errorCode;
    this.requestId = options?.requestId;

    // Set prototype for proper instanceof behavior
    Object.setPrototypeOf(this, FinaultError.prototype);
  }

  public toString(): string {
    const parts = [this.message];
    if (this.statusCode) parts.push(`status=${this.statusCode}`);
    if (this.errorCode) parts.push(`code=${this.errorCode}`);
    if (this.requestId) parts.push(`request_id=${this.requestId}`);
    return `${this.name}: ${parts.join(', ')}`;
  }
}

export class AuthenticationError extends FinaultError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      errorCode?: string;
      requestId?: string;
    }
  ) {
    super(message, { statusCode: 401, ...options });
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class RateLimitError extends FinaultError {
  public readonly retryAfter: number;

  constructor(
    message: string,
    retryAfter: number = 60,
    options?: {
      errorCode?: string;
      requestId?: string;
    }
  ) {
    super(message, { statusCode: 429, ...options });
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class ValidationError extends FinaultError {
  public readonly fieldErrors: Record<string, string>;

  constructor(
    message: string,
    fieldErrors: Record<string, string> = {},
    options?: {
      errorCode?: string;
      requestId?: string;
    }
  ) {
    super(message, { statusCode: 400, ...options });
    this.fieldErrors = fieldErrors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class APIError extends FinaultError {
  constructor(
    message: string,
    options?: {
      statusCode?: number;
      errorCode?: string;
      requestId?: string;
    }
  ) {
    super(message, options);
    Object.setPrototypeOf(this, APIError.prototype);
  }
}
