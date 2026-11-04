/**
 * Thrown by domain functions and mapped to HTTP by {@link catchDomainErrors}.
 */
export class DomainError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
  }
}

export class DrawError extends DomainError {
  constructor(message: string, status = 400, code?: string) {
    super(message, status, code);
    this.name = "DrawError";
  }
}

export class EventError extends DomainError {
  constructor(message: string, status = 400, code?: string) {
    super(message, status, code);
    this.name = "EventError";
  }
}

export class PersonError extends DomainError {
  constructor(message: string, status = 400, code?: string) {
    super(message, status, code);
    this.name = "PersonError";
  }
}

export class InvitationSendError extends DomainError {
  constructor(message: string, status = 400, code?: string) {
    super(message, status, code);
    this.name = "InvitationSendError";
  }
}

export class SignalUnlinkedError extends DomainError {
  constructor(
    message = "Signal unlinked this device. Link again from Settings.",
  ) {
    super(message, 400, "SIGNAL_UNLINKED");
    this.name = "SignalUnlinkedError";
  }
}
