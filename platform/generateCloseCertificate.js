export function generateCloseCertificate(close) {
  return `<h1>Finault Close Certificate</h1>
<p>This certifies that the AI service invoices listed herein were ingested and recorded.</p>
<p><strong>Period:</strong> ${close.period_start} to ${close.period_end}<br/>
<strong>Providers:</strong> ${close.providers.join(', ')}<br/>
<strong>Total Spend:</strong> ${close.currency} ${close.total_spend.toFixed(2)}</p>
<p>Generated on ${close.created_at}</p>`;
}
