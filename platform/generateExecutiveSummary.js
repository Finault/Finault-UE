export function generateExecutiveSummary(close) {
  return `<h1>AI Spend Executive Summary</h1>
<p><strong>Period:</strong> ${close.period_start} to ${close.period_end}</p>
<p><strong>Providers:</strong> ${close.providers.join(', ')}</p>
<p><strong>Total AI Spend:</strong> ${close.currency} ${close.total_spend.toFixed(2)}</p>
<p><strong>Invoices processed:</strong> ${close.invoices.length}</p>`;
}
