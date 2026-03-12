/**
 * Import payment plans and renewal dates from Accelerator Students spreadsheet.
 * Run with: npx tsx scripts/import-payment-plans.ts
 */
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "mission-control.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Payment type mapping from spreadsheet → DB
const PLAN_MAP: Record<string, string> = {
  "Annual": "annual",
  "Monthly": "monthly",
  "Quarterly": "quarterly",
  "Multi Pay (Needs new link to renew)": "annual_3pay",
};

// Data extracted from the spreadsheet (Name, Renewal Date, Payment Type)
const DATA: { name: string; renewal_date: string; payment_type: string }[] = [
  { name: "Sally Harris", renewal_date: "2026-06-16", payment_type: "Annual" },
  { name: "Kirk Taylor", renewal_date: "2025-04-29", payment_type: "Annual" },
  { name: "Kaela McKaig", renewal_date: "2025-11-14", payment_type: "" }, // "Free Year" - no mapping
  { name: "Nicholas Meissner", renewal_date: "", payment_type: "Monthly" },
  { name: "Mia Hewett", renewal_date: "2026-02-24", payment_type: "annual_3pay" }, // Multi Pay
  { name: "Elizabeth Moyer", renewal_date: "2027-01-29", payment_type: "Annual" },
  { name: "Roy Abdo", renewal_date: "", payment_type: "Monthly" },
  { name: "Alexa Saarenoja", renewal_date: "2026-02-17", payment_type: "annual_3pay" }, // Multi Pay
  { name: "Jake Berman", renewal_date: "2026-02-21", payment_type: "annual_3pay" }, // Multi Pay
  { name: "Lorena Pernalete", renewal_date: "2026-02-21", payment_type: "annual_3pay" }, // Multi Pay
  { name: "Jen Chapin", renewal_date: "2026-02-21", payment_type: "annual_3pay" }, // Multi Pay
  { name: "Valarie Linnen", renewal_date: "", payment_type: "Monthly" },
  { name: "Alison Luff", renewal_date: "2026-10-06", payment_type: "Quarterly" },
  { name: "Gwen Bach", renewal_date: "2026-03-19", payment_type: "Annual" },
  { name: "Kristen Elizabeth", renewal_date: "2026-03-20", payment_type: "Annual" },
  { name: "Tinnette Hales", renewal_date: "", payment_type: "Monthly" },
  { name: "Nick Todd", renewal_date: "", payment_type: "Monthly" },
  { name: "Quentin Suys", renewal_date: "2026-04-15", payment_type: "annual_3pay" }, // Multi Pay
  { name: "Daniel Osamor", renewal_date: "2026-04-16", payment_type: "Annual" },
  { name: "Carrie Stone", renewal_date: "", payment_type: "Monthly" },
  { name: "Jamie Morgan", renewal_date: "2026-04-19", payment_type: "Annual" },
  { name: "David Saenz", renewal_date: "", payment_type: "Monthly" },
  { name: "Debra Ann Cruz", renewal_date: "2026-04-28", payment_type: "annual_3pay" }, // Multi Pay
  { name: "Cat&Chau Le", renewal_date: "2026-05-31", payment_type: "annual_3pay" }, // Multi Pay
  { name: "Erik Taniguchi", renewal_date: "", payment_type: "Monthly" },
  { name: "Meghan Garcia-Webb", renewal_date: "", payment_type: "Monthly" },
  { name: "Chris Thomas", renewal_date: "2026-06-13", payment_type: "annual_3pay" }, // Multi Pay
  { name: "Ben Drohan", renewal_date: "2026-07-01", payment_type: "annual_3pay" }, // Multi Pay
  { name: "Shawn Simmons", renewal_date: "2026-08-11", payment_type: "Quarterly" },
  { name: "Kelli Allen", renewal_date: "2026-08-21", payment_type: "Quarterly" },
  { name: "Jeremy Saller", renewal_date: "", payment_type: "Monthly" },
  { name: "Matt Kessler", renewal_date: "", payment_type: "Monthly" },
  { name: "Rosanne Pitzer", renewal_date: "", payment_type: "Monthly" },
  { name: "Stephan Hoevenaar", renewal_date: "", payment_type: "" }, // "Custom" - no mapping
  { name: "Megan Milne", renewal_date: "", payment_type: "Monthly" },
  { name: "Eric Basek", renewal_date: "2026-09-12", payment_type: "" }, // "Custom" - no mapping
  { name: "Spencer Dunbar", renewal_date: "", payment_type: "Monthly" },
  { name: "Jennie Lakenan", renewal_date: "", payment_type: "" }, // "Custom" - no mapping
  { name: "Matthew Dawson", renewal_date: "2026-10-06", payment_type: "annual_3pay" }, // Multi Pay
  { name: "Susan Newman", renewal_date: "", payment_type: "Monthly" },
  { name: "Kristina McPherson", renewal_date: "2026-10-13", payment_type: "Annual" },
  { name: "Jan Griffiths", renewal_date: "2026-10-16", payment_type: "Quarterly" },
  { name: "Joey Hudson", renewal_date: "", payment_type: "Monthly" },
  { name: "John Rojas", renewal_date: "", payment_type: "Monthly" },
  { name: "Lisa McBride-Ramler", renewal_date: "", payment_type: "Monthly" },
  { name: "Petrina Verma", renewal_date: "", payment_type: "Monthly" },
  { name: "Gary Gold", renewal_date: "", payment_type: "Monthly" },
  { name: "Jeremy Ueberroth", renewal_date: "", payment_type: "Monthly" },
  { name: "Autumn Smith", renewal_date: "", payment_type: "Monthly" },
  { name: "Hernando Thola", renewal_date: "", payment_type: "Monthly" },
  { name: "Motuma Kaba", renewal_date: "", payment_type: "Monthly" },
  { name: "John Griffin", renewal_date: "2026-11-16", payment_type: "Quarterly" },
  { name: "Stacy Paulson", renewal_date: "2027-01-02", payment_type: "" }, // "Custom" - no mapping
  { name: "Taylor Castleberry", renewal_date: "", payment_type: "Monthly" },
  { name: "Monisha Bhanote", renewal_date: "", payment_type: "Monthly" },
  { name: "Mandy Cheung", renewal_date: "", payment_type: "" }, // "Custom" - no mapping
  { name: "Carrie Barnard", renewal_date: "2026-12-31", payment_type: "Annual" },
  { name: "Cara Alexander", renewal_date: "", payment_type: "Monthly" },
  { name: "Lora Freeman", renewal_date: "", payment_type: "Monthly" },
  { name: "Cortney Craven", renewal_date: "", payment_type: "Monthly" },
  { name: "Dennis Wilborn", renewal_date: "", payment_type: "Monthly" },
  { name: "Carmin Russell", renewal_date: "", payment_type: "Monthly" },
  { name: "Brooke Fay", renewal_date: "2027-01-15", payment_type: "Quarterly" },
  { name: "Mish Lim", renewal_date: "", payment_type: "Monthly" },
  { name: "Stephen Barnes", renewal_date: "2027-01-15", payment_type: "Annual" },
  { name: "Yulin Lee", renewal_date: "", payment_type: "Monthly" },
  { name: "Michael Musgrove", renewal_date: "2027-01-29", payment_type: "Annual" },
  { name: "Rey Martinez", renewal_date: "", payment_type: "Monthly" },
  { name: "Shereen Yanni", renewal_date: "", payment_type: "Monthly" },
  { name: "Hayden Pedersen", renewal_date: "", payment_type: "Monthly" },
  { name: "Chris Little", renewal_date: "", payment_type: "Monthly" },
  { name: "Andrea Grassi", renewal_date: "", payment_type: "Quarterly" },
  { name: "Meredith Walker", renewal_date: "", payment_type: "Monthly" },
  { name: "Martin Lesperance", renewal_date: "", payment_type: "Monthly" },
  { name: "Dean-O Lies", renewal_date: "", payment_type: "Monthly" },
  { name: "Stacey Obyrne", renewal_date: "2027-02-12", payment_type: "Annual" },
  { name: "Agness Mumbi", renewal_date: "", payment_type: "Monthly" },
];

// Get all students from DB for name matching
const allStudents = db.prepare("SELECT id, name FROM students").all() as { id: string; name: string }[];

// Build a name → id lookup (case-insensitive, trim)
const nameToId = new Map<string, string>();
for (const s of allStudents) {
  nameToId.set(s.name.toLowerCase().trim(), s.id);
}

const updateStmt = db.prepare(
  "UPDATE students SET payment_plan = ?, renewal_date = ?, updated_at = datetime('now') WHERE id = ?"
);

let updated = 0;
let skipped = 0;
let notFound = 0;

for (const row of DATA) {
  const id = nameToId.get(row.name.toLowerCase().trim());
  if (!id) {
    console.log(`  NOT FOUND: "${row.name}"`);
    notFound++;
    continue;
  }

  // Map payment type
  let plan = "";
  if (row.payment_type === "annual_3pay") {
    plan = "annual_3pay";
  } else if (row.payment_type && PLAN_MAP[row.payment_type]) {
    plan = PLAN_MAP[row.payment_type];
  }

  // Skip if nothing to update
  if (!plan && !row.renewal_date) {
    skipped++;
    continue;
  }

  updateStmt.run(plan, row.renewal_date, id);
  const parts: string[] = [];
  if (plan) parts.push(`plan=${plan}`);
  if (row.renewal_date) parts.push(`renewal=${row.renewal_date}`);
  console.log(`  UPDATED: ${row.name} → ${parts.join(", ")}`);
  updated++;
}

console.log(`\nDone! Updated: ${updated}, Skipped (no data): ${skipped}, Not found: ${notFound}`);
db.close();
