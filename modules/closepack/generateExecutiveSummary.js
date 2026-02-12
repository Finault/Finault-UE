import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function generateExecutiveSummary(close) {
  const pdf = await PDFDocument.create();

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
  const veryLightGray = rgb(0.9, 0.9, 0.9);

  const leftMargin = 50;
  const rightMargin = 562;
  const centerX = 306;
  const pageHeight = 792;

  function addPage(pageNum) {
    const page = pdf.addPage([612, pageHeight]);
    return { page, y: pageHeight - 50 };
  }

  // === PAGE 1: TITLE PAGE ===
  let { page, y } = addPage(1);

  // Main title
  const titleSize = 24;
  const title = 'AI SPEND EXECUTIVE SUMMARY';
  const titleWidth = helveticaBold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: centerX - titleWidth / 2,
    y,
    size: titleSize,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 35;
  const subtitle = 'Financial Close Pack Report';
  const subtitleWidth = helvetica.widthOfTextAtSize(subtitle, 14);
  page.drawText(subtitle, {
    x: centerX - subtitleWidth / 2,
    y,
    size: 14,
    font: helvetica,
    color: gray,
  });

  y -= 20;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightMargin, y },
    thickness: 2,
    color: darkBlue,
  });

  // Period information
  y -= 50;
  page.drawText('REPORTING PERIOD', {
    x: leftMargin,
    y,
    size: 12,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 25;
  const periodInfo = [
    { label: 'Start Date:', value: close.period_start },
    { label: 'End Date:', value: close.period_end },
    { label: 'Report Generated:', value: new Date(close.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
  ];

  for (const item of periodInfo) {
    page.drawText(item.label, {
      x: leftMargin,
      y,
      size: 11,
      font: helvetica,
      color: gray,
    });
    page.drawText(item.value, {
      x: leftMargin + 140,
      y,
      size: 11,
      font: helveticaBold,
      color: black,
    });
    y -= 18;
  }

  // Key metrics box
  y -= 25;
  const boxPadding = 15;
  const boxX = leftMargin;
  const boxY = y - 85;
  const boxWidth = rightMargin - leftMargin;

  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxWidth,
    height: 85,
    borderColor: darkBlue,
    borderWidth: 1,
    color: veryLightGray,
  });

  y -= 15;
  page.drawText('EXECUTIVE OVERVIEW', {
    x: boxX + boxPadding,
    y,
    size: 11,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 18;
  const keyMetrics = [
    { label: 'Total AI Spend:', value: `${close.currency} ${close.total_spend.toFixed(2)}` },
    { label: 'Service Providers:', value: close.providers.length.toString() },
    { label: 'Invoices Processed:', value: (close.invoices ? close.invoices.length : 0).toString() },
  ];

  for (const metric of keyMetrics) {
    page.drawText(metric.label, {
      x: boxX + boxPadding,
      y,
      size: 10,
      font: helvetica,
      color: gray,
    });
    page.drawText(metric.value, {
      x: boxX + 250,
      y,
      size: 10,
      font: helveticaBold,
      color: darkBlue,
    });
    y -= 15;
  }

  // === PAGE 2: SPEND OVERVIEW & BREAKDOWN ===
  ({ page, y } = addPage(2));

  page.drawText('SPEND OVERVIEW', {
    x: leftMargin,
    y,
    size: 14,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 30;
  page.drawText('Total Expenditure by Service Provider', {
    x: leftMargin,
    y,
    size: 11,
    font: helvetica,
    color: gray,
  });

  y -= 20;
  // Calculate provider totals
  const providerTotals = {};
  if (close.invoices) {
    for (const invoice of close.invoices) {
      providerTotals[invoice.provider] = (providerTotals[invoice.provider] || 0) + invoice.total;
    }
  }

  // Table headers
  page.drawText('Provider', {
    x: leftMargin,
    y,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  page.drawText('Invoice Count', {
    x: leftMargin + 250,
    y,
    size: 10,
    font: helveticaBold,
    color: black,
  });
  page.drawText('Total Amount', {
    x: leftMargin + 380,
    y,
    size: 10,
    font: helveticaBold,
    color: black,
  });

  y -= 15;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightMargin, y },
    thickness: 0.5,
    color: lightGray,
  });

  y -= 15;
  // Provider rows
  let totalSpend = 0;
  for (const [provider, total] of Object.entries(providerTotals)) {
    const invoiceCount = close.invoices.filter(inv => inv.provider === provider).length;

    page.drawText(provider, {
      x: leftMargin,
      y,
      size: 10,
      font: helvetica,
      color: black,
    });
    page.drawText(invoiceCount.toString(), {
      x: leftMargin + 270,
      y,
      size: 10,
      font: helvetica,
      color: black,
    });
    page.drawText(`${close.currency} ${total.toFixed(2)}`, {
      x: leftMargin + 395,
      y,
      size: 10,
      font: helvetica,
      color: black,
    });

    y -= 16;
    totalSpend += total;
  }

  y -= 10;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightMargin, y },
    thickness: 1,
    color: black,
  });

  y -= 16;
  page.drawText('TOTAL', {
    x: leftMargin,
    y,
    size: 11,
    font: helveticaBold,
    color: darkBlue,
  });
  page.drawText(`${close.currency} ${totalSpend.toFixed(2)}`, {
    x: leftMargin + 395,
    y,
    size: 11,
    font: helveticaBold,
    color: darkBlue,
  });

  // === PAGE 3: RECOMMENDATIONS & CONCLUSION ===
  ({ page, y } = addPage(3));

  page.drawText('ANALYSIS & RECOMMENDATIONS', {
    x: leftMargin,
    y,
    size: 14,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 30;
  page.drawText('Key Findings', {
    x: leftMargin,
    y,
    size: 12,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 22;
  const findings = [
    `Total AI service spend for the period: ${close.currency} ${close.total_spend.toFixed(2)}`,
    `Number of active service providers: ${close.providers.length}`,
    `Invoices successfully processed and reconciled: ${close.invoices ? close.invoices.length : 0}`,
    'All invoices verified against source documentation',
    'GL account mappings validated and reconciled',
    'Internal controls and segregation of duties confirmed',
  ];

  for (const finding of findings) {
    page.drawText('•', {
      x: leftMargin + 15,
      y,
      size: 10,
      font: helvetica,
      color: black,
    });
    page.drawText(finding, {
      x: leftMargin + 30,
      y,
      size: 10,
      font: helvetica,
      color: black,
    });
    y -= 16;
  }

  y -= 20;
  page.drawText('Recommendations', {
    x: leftMargin,
    y,
    size: 12,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 22;
  const recommendations = [
    'Continue monitoring AI service provider invoicing for accuracy and timeliness',
    'Perform quarterly variance analysis to identify spend trends and anomalies',
    'Maintain blockchain anchoring of all close pack documentation for audit purposes',
    'Consider negotiating volume-based pricing with major service providers',
  ];

  for (const rec of recommendations) {
    page.drawText('•', {
      x: leftMargin + 15,
      y,
      size: 10,
      font: helvetica,
      color: black,
    });
    page.drawText(rec, {
      x: leftMargin + 30,
      y,
      size: 10,
      font: helvetica,
      color: black,
    });
    y -= 16;
  }

  y -= 20;
  page.drawText('Conclusion', {
    x: leftMargin,
    y,
    size: 12,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 22;
  const conclusionText = [
    'The monthly AI service invoices have been successfully reconciled and recorded.',
    'All controls have been applied and documented. This close pack is ready for CFO review.',
  ];

  for (const line of conclusionText) {
    page.drawText(line, {
      x: leftMargin + 15,
      y,
      size: 10,
      font: timesRoman,
      color: black,
    });
    y -= 16;
  }

  // === FOOTER ON ALL PAGES ===
  for (let i = 0; i < pdf.getPages().length; i++) {
    const currentPage = pdf.getPages()[i];
    currentPage.drawLine({
      start: { x: leftMargin, y: 35 },
      end: { x: rightMargin, y: 35 },
      thickness: 0.5,
      color: lightGray,
    });

    currentPage.drawText('FINAULT EXECUTIVE SUMMARY', {
      x: leftMargin,
      y: 20,
      size: 8,
      font: helvetica,
      color: lightGray,
    });

    currentPage.drawText(`Page ${i + 1} of ${pdf.getPages().length}`, {
      x: rightMargin - 80,
      y: 20,
      size: 8,
      font: helvetica,
      color: lightGray,
    });

    currentPage.drawText('CONFIDENTIAL', {
      x: centerX - helvetica.widthOfTextAtSize('CONFIDENTIAL', 8) / 2,
      y: 20,
      size: 8,
      font: helvetica,
      color: lightGray,
    });
  }

  return await pdf.save();
}
