import { TransactionRecord } from '../types';

/**
 * Exports a formatted CSV file of all transaction records in the ledger
 */
export function exportSalesLedgerCsv(
  transactions: TransactionRecord[],
  platformFeePercent: number = 12
) {
  const headers = [
    'Transaction ID',
    'Item Name',
    'Date',
    'Buyer',
    'Gross Price ($)',
    `Platform Fee (${platformFeePercent}%) ($)`,
    'Net Payout ($)',
    'Status',
  ];

  const escapeCsv = (val: any): string => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = transactions.map((t) => [
    escapeCsv(t.id),
    escapeCsv(t.modelTitle),
    escapeCsv(t.timestamp),
    escapeCsv(t.buyerName),
    escapeCsv(t.listedPrice.toFixed(2)),
    escapeCsv(t.platformFee.toFixed(2)),
    escapeCsv(t.creatorPayout.toFixed(2)),
    escapeCsv(t.status),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `printforge_sales_ledger_${new Date().toISOString().split('T')[0]}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
