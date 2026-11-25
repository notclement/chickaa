/** A user-facing validation problem in money data. `code` is stable; `message` is plain English. */
export class FinanceError extends Error {
  constructor(
    readonly code:
      | 'INVALID_AMOUNT'
      | 'INVALID_RATE'
      | 'INVALID_SPLIT'
      | 'INVALID_PAYERS'
      | 'AMOUNT_TOO_SMALL'
      | 'LEDGER_INCONSISTENT',
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'FinanceError';
  }
}
