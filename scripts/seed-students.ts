import * as XLSX from 'xlsx';
import { getDb } from '../src/lib/db';
import { v4 as uuidv4 } from 'uuid';

const wb = XLSX.readFile('/Users/briangriffith/Downloads/Accelerator_Students_1771459745.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

// Skip header rows
const rows = data.slice(2);

function excelDate(serial: unknown): string {
  if (serial === undefined || serial === null || serial === '' || typeof serial !== 'number') return '';
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

function mapPayment(raw: string): string {
  if (!raw) return '';
  const l = raw.toLowerCase();
  if (l.includes('3 pay') || l.includes('3pay')) return 'annual_3pay';
  if (l.includes('multi pay')) return 'annual_3pay';
  if (l.includes('annual') || l.includes('yearly') || l.includes('free year')) return 'annual';
  if (l.includes('quarterly')) return 'quarterly';
  if (l.includes('monthly')) return 'monthly';
  if (l.includes('90') || l.includes('ninety')) return '90_day';
  if (l.includes('custom')) return 'monthly'; // default custom to monthly
  return '';
}

function mapStatus(raw: string): string {
  if (!raw) return 'active';
  const l = raw.toLowerCase();
  if (l.includes('cancel')) return 'cancelled';
  if (l.includes('pause')) return 'paused';
  if (l.includes('downgrad')) return 'downgraded';
  return 'active';
}

function cleanYouTube(raw: string): string {
  if (!raw) return '';
  // Extract URL if there's text before it
  const match = raw.match(/(https?:\/\/[^\s]+)/);
  return match ? match[1] : raw;
}

const db = getDb();

// Check if students already exist
const existing = db.prepare('SELECT COUNT(*) AS cnt FROM students').get() as { cnt: number };
if (existing.cnt > 0) {
  console.log(`Database already has ${existing.cnt} students. Skipping seed.`);
  console.log('To re-seed, delete mission-control.db and run again.');
  process.exit(0);
}

const insert = db.prepare(
  `INSERT INTO students (id, name, email, youtube_channel, coach, program, monthly_revenue, signup_date, status, payment_plan, renewal_date, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

let count = 0;
const seedAll = db.transaction(() => {
  for (const r of rows) {
    const name = String(r['Accelerator Students'] || '').trim();
    if (!name) continue;

    const coach = String(r['__EMPTY_2'] || '');
    const youtube = cleanYouTube(String(r['__EMPTY_7'] || ''));
    const renewalDate = excelDate(r['__EMPTY_9']);
    const paymentPlan = mapPayment(String(r['__EMPTY_10'] || ''));
    const status = mapStatus(String(r['__EMPTY_11'] || ''));
    const signupDate = excelDate(r['__EMPTY_24']);

    // Skip students with "Not Started" as coach — set as empty
    const cleanCoach = coach === 'Not Started' ? '' : coach;

    insert.run(
      uuidv4(),
      name,
      '',                    // email
      youtube,
      cleanCoach,
      'accelerator',         // all are accelerator students
      0,                     // monthly_revenue (not in spreadsheet)
      signupDate || new Date().toISOString().slice(0, 10),
      status,
      paymentPlan,
      renewalDate,
      ''                     // notes
    );
    count++;
  }
});

seedAll();
console.log(`Seeded ${count} accelerator students.`);

// Show summary
const byCoach = db.prepare(
  `SELECT coach, COUNT(*) as cnt, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
   FROM students GROUP BY coach ORDER BY cnt DESC`
).all() as { coach: string; cnt: number; active: number }[];

console.log('\nBy coach:');
for (const c of byCoach) {
  console.log(`  ${c.coach || '(unassigned)'}: ${c.cnt} total, ${c.active} active`);
}

const byStatus = db.prepare(
  'SELECT status, COUNT(*) as cnt FROM students GROUP BY status'
).all() as { status: string; cnt: number }[];

console.log('\nBy status:');
for (const s of byStatus) {
  console.log(`  ${s.status}: ${s.cnt}`);
}
