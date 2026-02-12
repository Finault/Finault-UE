import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function generateJournalEntry(close) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // Letter size

  // Embed fonts
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const courier = await pdf.embedFont(StandardFonts.Courier);

  // Colors
  const black = rgb(0, 0, 0);
  const darkBlue = rgb(0.1, 0.3, 0.6);
  const gray = rgb(0.35, 0.35, 0.35);
  const lightGray = rgb(0.6, 0.6, 0.6);
  const veryLightGray = rgb(0.95, 0.95, 0.95);

  // Layout constants
  let y = 742;
  const leftMargin = 40;
  const rightMargin = 572;
  const centerX = 306;

  // === HEADER ===
  const title = 'JOURNAL ENTRY REPORT';
  const titleWidth = helveticaBold.widthOfTextAtSize(title, 16);
  page.drawText(title, {
    x: centerX - titleWidth / 2,
    y,
    size: 16,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 25;
  const subtitle = 'AI Service Invoice Reconciliation Entry';
  const subtitleWidth = helvetica.widthOfTextAtSize(subtitle, 10);
  page.drawText(subtitle, {
    x: centerX - subtitleWidth / 2,
    y,
    size: 10,
    font: helvetica,
    color: gray,
  });

  // === JOURNAL ENTRY HEADER INFO ===
  y -= 25;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightMargin, y },
    thickness: 1.5,
    color: darkBlue,
  });

  y -= 20;
  const entryDate = new Date(close.period_end);
  const jeNumber = `JE-${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}-AI-001`;

  const headerInfo = [
    { label: 'Journal Entry #:', value: jeNumber },
    { label: 'Entry Date:', value: entryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
    { label: 'Period Covered:', value: `${close.period_start} to ${close.period_end}` },
    { label: 'Description:', value: 'Monthly AI service invoice accrual and accounts payable entry' },
  ];

  for (const info of headerInfo) {
    page.drawText(info.label, {
      x: leftMargin,
      y,
      size: 9,
      font: helvetica,
      color: gray,
    });
    page.drawText(info.value, {
      x: leftMargin + 130,
      y,
      size: 9,
      font: helveticaBold,
      color: black,
    });
    y -= 15;
  }

  // === TABLE HEADER ===
  y -= 20;
  const colDate = leftMargin;
  const colAccount = leftMargin + 90;
  const colDebit = leftMargin + 300;
  const colCredit = leftMargin + 430;

  // Background for header
  page.drawRectangle({
    x: leftMargin,
    y: y - 16,
    width: rightMargin - leftMargin,
    height: 16,
    color: veryLightGray,
  });

  page.drawText('Date', {
    x: colDate,
    y,
    size: 9,
    font: helveticaBold,
    color: black,
  });

  page.drawText('Account', {
    x: colAccount,
    y,
    size: 9,
    font: helveticaBold,
    color: black,
  });

  page.drawText('Debit', {
    x: colDebit,
    y,
    size: 9,
    font: helveticaBold,
    color: black,
  });

  page.drawText('Credit', {
    x: colCredit,
    y,
    size: 9,
    font: helveticaBold,
    color: black,
  });

  y -= 18;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightMargin, y },
    thickness: 1,
    color: black,
  });

  // === JOURNAL ENTRY LINES ===
  y -= 14;
  const dateStr = entryDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });

  // Calculate provider totals
  const providerTotals = {};
  if (close.invoices) {
    for (const invoice of close.invoices) {
      providerTotals[invoice.provider] = (providerTotals[invoice.provider] || 0) + invoice.total;
    }
  }

  let totalDebits = 0;
  let totalCredits = 0;
  let lineNum = 0;

  for (const [provider, amount] of Object.entries(providerTotals)) {
    // Debit: AI Expense account
    lineNum++;
    page.drawText(dateStr, {
      x: colDate,
      y,
      size: 8,
      font: courier,
      color: black,
    });

    page.drawText(`AI Services Expense - ${provider}`, {
      x: colAccount,
      y,
      size: 8,
      font: helvetica,
      color: black,
    });

    const debitAmount = amount.toFixed(2);
    page.drawText(debitAmount, {
      x: colDebit,
      y,
      size: 8,
      font: courier,
      color: black,
    });

    page.drawText('', {
      x: colCredit,
      y,
      size: 8,
      font: courier,
      color: black,
    });

    totalDebits += amount;
    y -= 13;

    // Credit: Accounts Payable account
    lineNum++;
    page.drawText(dateStr, {
      x: colDate,
      y,
      size: 8,
      font: courier,
      color: black,
    });

    page.drawText(`Accounts Payable - ${provider}`, {
      x: colAccount,
      y,
      size: 8,
      font: helvetica,
      color: black,
    });

    page.drawText('', {
      x: colDebit,
      y,
      size: 8,
      font: courier,
      color: black,
    });

    const creditAmount = amount.toFixed(2);
    page.drawText(creditAmount, {
      x: colCredit,
      y,
      size: 8,
      font: courier,
      color: black,
    });

    totalCredits += amount;
    y -= 13;
  }

  // === TOTALS ===
  y -= 10;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightMargin, y },
    thickness: 1,
    color: black,
  });

  y -= 13;
  page.drawText('TOTALS', {
    x: colAccount - 60,
    y,
    size: 9,
    font: helveticaBold,
    color: black,
  });

  page.drawText(totalDebits.toFixed(2), {
    x: colDebit,
    y,
    size: 9,
    font: helveticaBold,
    color: black,
  });

  page.drawText(totalCredits.toFixed(2), {
    x: colCredit,
    y,
    size: 9,
    font: helveticaBold,
    color: black,
  });

  y -= 14;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightMargin, y },
    thickness: 1,
    color: black,
  });

  // === BALANCE VERIFICATION ===
  y -= 25;
  const variance = Math.abs(totalDebits - totalCredits);
  const isBalanced = variance < 0.01;

  page.drawText('BALANCE VERIFICATION', {
    x: leftMargin,
    y,
    size: 10,
    font: helveticaBold,
    color: darkBlue,
  });

  y -= 18;
  const verificationItems = [
    { label: 'Total Debits:', value: `${close.currency} ${totalDebits.toFixed(2)}` },
    { label: 'Total Credits:', value: `${close.currency} ${totalCredits.toFixed(2)}` },
    { label: 'Net Variance:', value: `${close.currency} ${variance.toFixed(2)}` },
    { label: 'Status:', value: isBalanced ? 'BALANCED ✓' : 'OUT OF BALANCE' },
  ];

  for (const item of verificationItems) {
    page.drawText(item.label, {
      x: leftMargin,
      y,
      size: 9,
      font: helvetica,
      color: gray,
    });

    const color = item.label === 'Status:' && isBalanced ? darkBlue : black;
    page.drawText(item.value, {
      x: leftMargin + 150,
      y,
      size: 9,
      font: item.label === 'Status:' ? helveticaBold : helvetica,
      color: color,
    });
    y -= 15;
  }

  // === FOOTER ===
  y = 50;
  page.drawLine({
    start: { x: leftMargin, y },
    end: { x: rightMargin, y },
    thickness: 0.5,
    color: lightGray,
  });

  page.drawText('JOURNAL ENTRY DETAIL', {
    x: leftMargin,
    y: y - 15,
    size: 8,
    font: helvetica,
    color: lightGray,
  });

  page.drawText('CONFIDENTIAL - ACCOUNTING RECORDS', {
    x: centerX - helvetica.widthOfTextAtSize('CONFIDENTIAL - ACCOUNTING RECORDS', 8) / 2,
    y: y - 15,
    size: 8,
    font: helvetica,
    color: lightGray,
  });

  page.drawText('Page 1 of 1', {
    x: rightMargin - 60,
    y: y - 15,
    size: 8,
    font: helvetica,
    color: lightGray,
  });

  return await pdf.save();
}
