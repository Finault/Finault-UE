export function buildClose(parsedInvoices, reconciliation) {
  if (!parsedInvoices.length) throw new Error('No invoices provided');
  const periodStart = parsedInvoices[0].billing_period_start;
  const periodEnd = parsedInvoices[0].billing_period_end;
  const currency = parsedInvoices[0].currency;

  for (const inv of parsedInvoices) {
    if (inv.currency !== currency) throw new Error('Mixed currencies');
    if (inv.billing_period_start !== periodStart || inv.billing_period_end !== periodEnd)
      throw new Error('Invoices span multiple periods');
  }

  const providers = [...new Set(parsedInvoices.map(i => i.provider))];
  const totalSpend = parsedInvoices.reduce((s,i)=>s+i.total,0);

  return {
    period_start: periodStart,
    period_end: periodEnd,
    currency,
    providers,
    invoices: parsedInvoices,
    total_spend: totalSpend,
    reconciliation,
    created_at: new Date().toISOString()
  };
}
