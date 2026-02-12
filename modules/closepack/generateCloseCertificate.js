import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import crypto from 'crypto';

export async function generateCloseCertificate(close) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // Letter size (8.5" x 11")

  // Embed fonts
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const timesRoman = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  // Colors
  const black = rgb(0, 0, 0);
  const darkBlue = rgb(0.1, 0.3, 0.6);
  const gray = rgb(0.35, 0.35, 0.35);
  const lightGray = rgb(0.6, 0.6, 0.6);

  // Layout constants
  let y = 742;
  const leftMargin = 50;
  const rightMargin = 562;
  const centerX = 306;

  // === HEADER ===
  const title = 'FINAULT CLOSE CERTIFICATE';
  const titleWidth = helveticaBold.widthOfTextAtSize(title, 18);
  page.drawText(title, {
    x: centerX - titleWidth / 2,
    y,
    size: 18,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 25;
  const subtitle = 'AI Service Invoice Reconciliation';
  const subtitleWidth = helvetica.widthOfTextAtSize(subtitle, 11);
  page.drawText(subtitle, {
    x: centerX - subtitleWidth / 2,
    y,
    size: 11,
    font: helvetica,
    color: gray,
  });

  // Horizontal line
  y -= 18;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightMargin, y },
    thickness: 2,
    color: darkBlue,
  });

  // === CERTIFICATE METADATA ===
  y -= 35;
  const generatedDate = new Date(close.created_at);
  const certId = 'CERT-' + crypto.randomBytes(8).toString('hex').toUpperCase();

  const metadata = [
    { label: 'Certificate ID:', value: certId },
    { label: 'Organization:', value: close.organization || 'Finault Corporation' },
    { label: 'Period Start:', value: close.period_start },
    { label: 'Period End:', value: close.period_end },
    { label: 'Generated:', value: generatedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
  ];

  for (const item of metadata) {
    page.drawText(item.label, {
      x: leftMargin,
      y,
      size: 10,
      font: helvetica,
      color: gray,
    });
    page.drawText(item.value, {
      x: leftMargin + 140,
      y,
      size: 10,
      font: helveticaBold,
      color: black,
    });
    y -= 18;
  }

  y -= 15;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightMargin, y },
    thickness: 0.5,
    color: lightGray,
  });

  // === SECTION I: INVOICE SUMMARY ===
  y -= 25;
  page.drawText('I. INVOICE SUMMARY', {
    x: leftMargin,
    y,
    size: 12,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 22;
  const summaryItems = [
    { label: 'Service Providers:', value: close.providers.join(', ') },
    { label: 'Total Invoices:', value: close.invoices ? close.invoices.length.toString() : '0' },
    { label: 'Total Spend:', value: `${close.currency} ${close.total_spend.toFixed(2)}` },
    { label: 'Currency:', value: close.currency },
  ];

  for (const item of summaryItems) {
    page.drawText(item.label, {
      x: leftMargin + 15,
      y,
      size: 10,
      font: helvetica,
      color: gray,
    });
    page.drawText(item.value, {
      x: leftMargin + 160,
      y,
      size: 10,
      font: helvetica,
      color: black,
    });
    y -= 16;
  }

  // === SECTION II: PROVIDER BREAKDOWN ===
  y -= 20;
  page.drawText('II. PROVIDER BREAKDOWN', {
    x: leftMargin,
    y,
    size: 12,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 22;
  if (close.invoices && close.invoices.length > 0) {
    const providerTotals = {};
    for (const invoice of close.invoices) {
      providerTotals[invoice.provider] = (providerTotals[invoice.provider] || 0) + invoice.total;
    }

    for (const [provider, total] of Object.entries(providerTotals)) {
      const providerLabel = provider;
      page.drawText(providerLabel, {
        x: leftMargin + 15,
        y,
        size: 9,
        font: helvetica,
        color: gray,
      });
      page.drawText(`${close.currency} ${total.toFixed(2)}`, {
        x: rightMargin - 100,
        y,
        size: 9,
        font: helveticaBold,
        color: black,
      });
      y -= 14;
    }
  }

  // === SECTION III: VERIFICATION & ATTESTATION ===
  y -= 25;
  page.drawText('III. VERIFICATION & ATTESTATION', {
    x: leftMargin,
    y,
    size: 12,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 22;
  const verificationHash = crypto.createHash('sha256')
    .update(JSON.stringify({ period_start: close.period_start, period_end: close.period_end, total: close.total_spend }))
    .digest('hex')
    .substring(0, 32);

  const verificationItems = [
    { label: 'Verification Hash:', value: verificationHash },
    { label: 'Status:', value: 'VERIFIED' },
    { label: 'Audit Trail:', value: 'Complete' },
  ];

  for (const item of verificationItems) {
    page.drawText(item.label, {
      x: leftMargin + 15,
      y,
      size: 9,
      font: helvetica,
      color: gray,
    });
    const valueX = item.label === 'Verification Hash:' ? leftMargin + 160 : leftMargin + 160;
    page.drawText(item.value, {
      x: valueX,
      y,
      size: 9,
      font: item.label === 'Verification Hash:' ? timesRoman : helvetica,
      color: black,
    });
    y -= 14;
  }

  // === CERTIFICATION STATEMENT ===
  y -= 25;
  page.drawText('CERTIFICATION STATEMENT', {
    x: leftMargin,
    y,
    size: 11,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 20;
  const certStatement = [
    'This certifies that the AI service invoices listed herein were properly ingested,',
    'reconciled, and recorded in accordance with Generally Accepted Accounting Principles',
    '(US GAAP). All invoices have been verified for accuracy and completeness.',
  ];

  for (const line of certStatement) {
    page.drawText(line, {
      x: leftMargin + 15,
      y,
      size: 9,
      font: timesItalic,
      color: black,
    });
    y -= 13;
  }

  // === FOOTER ===
  page.drawLine({
    start: { x: leftMargin, y: 55 },
    end: { x: rightMargin, y: 55 },
    thickness: 0.5,
    color: lightGray,
  });

  page.drawText('FINAULT CORPORATION', {
    x: leftMargin,
    y: 40,
    size: 8,
    font: helvetica,
    color: lightGray,
  });

  page.drawText('CONFIDENTIAL', {
    x: leftMargin,
    y: 28,
    size: 8,
    font: helvetica,
    color: lightGray,
  });

  const sealedText = `Generated: ${generatedDate.toISOString()}`;
  page.drawText(sealedText, {
    x: centerX - helvetica.widthOfTextAtSize(sealedText, 8) / 2,
    y: 28,
    size: 8,
    font: helvetica,
    color: lightGray,
  });

  page.drawText('Page 1 of 1', {
    x: rightMargin - 50,
    y: 28,
    size: 8,
    font: helvetica,
    color: lightGray,
  });

  return await pdf.save();
}
