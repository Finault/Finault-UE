/**
 * Journal Entry CSV Builder
 * Creates NetSuite-ready balanced journal entries
 *
 * NetSuite Journal Import format:
 * - External ID: unique identifier
 * - Date: transaction date
 * - Currency: USD
 * - Subsidiary: company/entity
 * - Account: GL account number or name
 * - Debit: debit amount (leave blank for credits)
 * - Credit: credit amount (leave blank for debits)
 * - Name: vendor/entity name
 * - Memo: line description
 * - Department: cost center
 * - Class: classification
 */

export interface JournalData {
  closeId: string;
  period: string;
  sealedAt: string;
  totalAmount: number;
  files: { name: string; size: number; provider?: string }[];
}

export async function buildJournalCsv(
  files: File[],
  closeId: string,
  journalData?: Partial<JournalData>
): Promise<Uint8Array> {
  const now = new Date();
  const period = journalData?.period || now.toISOString().slice(0, 7);
  const txDate = journalData?.sealedAt?.split("T")[0] || now.toISOString().split("T")[0];

  // Calculate total from files
  let totalAmount = journalData?.totalAmount || 0;
  if (!journalData?.totalAmount) {
    for (const file of files) {
      totalAmount += file.size;
    }
    totalAmount = Math.round(totalAmount / 100) / 100;
  }

  const jeNumber = `JE-AI-${period.replace("-", "")}-${closeId.slice(-6)}`;

  // CSV Headers (NetSuite compatible)
  const headers = [
    "External ID",
    "Date",
    "Currency",
    "Subsidiary",
    "Account",
    "Debit",
    "Credit",
    "Name",
    "Memo",
    "Department",
    "Class",
    "Close ID",
  ];

  const rows: string[][] = [];

  // Debit line: AI Spend Expense
  rows.push([
    jeNumber,
    txDate,
    "USD",
    "Parent Company",
    "6800 - AI Services Expense",
    totalAmount.toFixed(2),
    "",
    "AI Providers",
    `AI spend for period ${period}`,
    "Technology",
    "Operating Expense",
    closeId,
  ]);

  // Credit line: Accounts Payable
  rows.push([
    jeNumber,
    txDate,
    "USD",
    "Parent Company",
    "2100 - Accounts Payable",
    "",
    totalAmount.toFixed(2),
    "AI Providers",
    `AI spend accrual for period ${period}`,
    "Technology",
    "Operating Expense",
    closeId,
  ]);

  // If multiple files, add detail lines as memo entries
  if (files.length > 1) {
    // Add a blank row separator
    rows.push(Array(headers.length).fill(""));

    // Add summary header
    rows.push(["# INVOICE DETAIL", "", "", "", "", "", "", "", "", "", "", ""]);

    for (const file of files) {
      const amount = Math.round(file.size / 100) / 100;
      const provider = detectProvider(file.name);
      rows.push([
        `${jeNumber}-DETAIL`,
        txDate,
        "USD",
        "",
        "",
        "",
        "",
        provider,
        file.name,
        "",
        "",
        `${amount.toFixed(2)}`,
      ]);
    }
  }

  // Build CSV content
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => {
        // Escape cells containing commas or quotes
        if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(",")
    ),
  ];

  // Add footer with totals
  csvLines.push("");
  csvLines.push(`# Close ID: ${closeId}`);
  csvLines.push(`# Period: ${period}`);
  csvLines.push(`# Total Debits: ${totalAmount.toFixed(2)}`);
  csvLines.push(`# Total Credits: ${totalAmount.toFixed(2)}`);
  csvLines.push(`# Balance: 0.00`);
  csvLines.push(`# Files Processed: ${files.length}`);

  const csvContent = csvLines.join("\n");
  return new TextEncoder().encode(csvContent);
}

function detectProvider(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("openai") || lower.includes("gpt")) return "OpenAI";
  if (lower.includes("anthropic") || lower.includes("claude")) return "Anthropic";
  if (lower.includes("azure")) return "Microsoft Azure";
  if (lower.includes("google") || lower.includes("gemini") || lower.includes("vertex"))
    return "Google Cloud";
  if (lower.includes("aws") || lower.includes("bedrock") || lower.includes("amazon"))
    return "Amazon Web Services";
  if (lower.includes("cohere")) return "Cohere";
  if (lower.includes("mistral")) return "Mistral AI";
  return "AI Provider";
}
