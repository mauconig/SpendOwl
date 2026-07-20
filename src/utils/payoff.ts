export function monthlyRate(aprPct: number): number {
  return aprPct / 100 / 12;
}

// Payment needed to clear `balance` in exactly `months` at the given APR.
export function paymentForMonths(balance: number, aprPct: number, months: number): number {
  const r = monthlyRate(aprPct);
  if (r === 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

// Months to clear `balance` paying `payment`/month at the given APR.
// Returns null if `payment` doesn't even cover the first month's interest.
export function monthsForPayment(balance: number, aprPct: number, payment: number): number | null {
  const r = monthlyRate(aprPct);
  if (r === 0) return Math.ceil(balance / payment);
  const interest = balance * r;
  if (payment <= interest) return null;
  return Math.ceil(-Math.log(1 - interest / payment) / Math.log(1 + r));
}

// Total interest paid over the payoff, given the payment and resulting month count.
export function totalInterestPaid(balance: number, payment: number, months: number): number {
  return Math.max(payment * months - balance, 0);
}

// Combined monthly interest cost across all cards — feeds the "Card interest" donut slice.
export function cardInterestMonthly(cards: { balance: number; apr: number }[]): number {
  return cards.reduce((a, c) => a + c.balance * monthlyRate(c.apr), 0);
}
