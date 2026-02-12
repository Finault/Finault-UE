export function generateJournalEntry(close) {
  const rows = [];
  const date = close.period_end;

  for (const provider of close.providers) {
    const providerTotal = close.invoices
      .filter(i => i.provider === provider)
      .reduce((s,i)=>s+i.total,0);

    rows.push({ Date: date, Account: 'AI Expense', Debit: providerTotal.toFixed(2), Credit: '', Memo: provider + ' AI services' });
    rows.push({ Date: date, Account: 'Accounts Payable', Debit: '', Credit: providerTotal.toFixed(2), Memo: provider + ' AI services' });
  }
  return rows;
}
