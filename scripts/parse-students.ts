import * as XLSX from 'xlsx';

const wb = XLSX.readFile('/Users/briangriffith/Downloads/Accelerator_Students_1771459745.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

// Skip header rows (first 2 rows are 'Student List' and column headers)
const rows = data.slice(2);

// Excel serial date to YYYY-MM-DD
function excelDate(serial: unknown): string {
  if (serial === undefined || serial === null || serial === '' || typeof serial !== 'number') return '';
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

// Map payment types
function mapPayment(raw: string): string {
  if (raw === undefined || raw === null || raw === '') return '';
  const l = raw.toLowerCase();
  if (l.includes('3 pay') || l.includes('3pay')) return 'annual_3pay';
  if (l.includes('annual') || l.includes('yearly')) return 'annual';
  if (l.includes('quarterly')) return 'quarterly';
  if (l.includes('monthly')) return 'monthly';
  if (l.includes('90') || l.includes('ninety')) return '90_day';
  if (l.includes('free')) return 'annual';
  return raw;
}

// Map status
function mapStatus(raw: string): string {
  if (raw === undefined || raw === null || raw === '') return 'active';
  const l = raw.toLowerCase();
  if (l.includes('cancel')) return 'cancelled';
  if (l.includes('pause')) return 'paused';
  if (l.includes('downgrad')) return 'downgraded';
  return 'active';
}

interface ParsedStudent {
  name: string;
  coach: string;
  youtube: string;
  renewal_date: string;
  payment_plan: string;
  payment_raw: string;
  status: string;
  status_raw: string;
  signup_date: string;
  cancelled_date: string;
}

const students: ParsedStudent[] = rows.map((r) => ({
  name: String(r['Accelerator Students'] || ''),
  coach: String(r['__EMPTY_2'] || ''),
  youtube: String(r['__EMPTY_7'] || ''),
  renewal_date: excelDate(r['__EMPTY_9']),
  payment_plan: mapPayment(String(r['__EMPTY_10'] || '')),
  payment_raw: String(r['__EMPTY_10'] || ''),
  status: mapStatus(String(r['__EMPTY_11'] || '')),
  status_raw: String(r['__EMPTY_11'] || ''),
  signup_date: excelDate(r['__EMPTY_24']),
  cancelled_date: excelDate(r['__EMPTY_25']),
})).filter((s) => s.name.trim().length > 0);

console.log(JSON.stringify(students, null, 2));
console.error(`\nTotal students parsed: ${students.length}`);

// Show unique values for mapping verification
const statuses = new Set(students.map(s => s.status_raw));
const payments = new Set(students.map(s => s.payment_raw));
const coaches = new Set(students.map(s => s.coach));
console.error('Unique statuses:', [...statuses]);
console.error('Unique payment types:', [...payments]);
console.error('Unique coaches:', [...coaches]);
