require('dotenv').config();

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://ernos:ernos@localhost:5432/ernos_zdravstvena_njega';
const TENANT_ID = Number(process.env.DEMO_TENANT_ID || 1);
const DEMO_MARKER = '[DEMO ERNOS]';

const pool = new Pool({ connectionString: DATABASE_URL });

function plusHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function plusDays(days, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute || 0, 0, 0);
  return d.toISOString();
}

function code(slug) {
  return 'demo-' + slug;
}

async function ensureTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      date_of_birth DATE,
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      family_contact_name TEXT NOT NULL DEFAULT '',
      family_contact_phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS scan_code TEXT;
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS allergies TEXT NOT NULL DEFAULT '';
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS diagnoses TEXT NOT NULL DEFAULT '';
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS risks TEXT NOT NULL DEFAULT '';
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS mobility_note TEXT NOT NULL DEFAULT '';
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS access_note TEXT NOT NULL DEFAULT '';
    CREATE UNIQUE INDEX IF NOT EXISTS ux_patients_scan_code ON patients(scan_code) WHERE scan_code IS NOT NULL;

    CREATE TABLE IF NOT EXISTS planned_visits (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      patient_id BIGINT NOT NULL,
      planned_for TIMESTAMPTZ,
      window_text TEXT NOT NULL DEFAULT '',
      visit_type TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planned',
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_planned_visits_tenant_time ON planned_visits(tenant_id, planned_for DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_planned_visits_patient ON planned_visits(tenant_id, patient_id, planned_for DESC, id DESC);

    CREATE TABLE IF NOT EXISTS care_visits (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      patient_id BIGINT NOT NULL,
      planned_visit_id BIGINT,
      started_by BIGINT,
      started_by_name TEXT NOT NULL DEFAULT '',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_by BIGINT,
      finished_by_name TEXT NOT NULL DEFAULT '',
      finished_at TIMESTAMPTZ,
      start_note TEXT NOT NULL DEFAULT '',
      finish_note TEXT NOT NULL DEFAULT '',
      performed_procedures TEXT NOT NULL DEFAULT '',
      procedure_note TEXT NOT NULL DEFAULT '',
      care_plan_done TEXT NOT NULL DEFAULT '',
      therapy_done TEXT NOT NULL DEFAULT '',
      bp TEXT NOT NULL DEFAULT '',
      pulse TEXT NOT NULL DEFAULT '',
      temperature TEXT NOT NULL DEFAULT '',
      spo2 TEXT NOT NULL DEFAULT '',
      pain_score TEXT NOT NULL DEFAULT '',
      wound_note TEXT NOT NULL DEFAULT '',
      family_notification_requested BOOLEAN NOT NULL DEFAULT FALSE,
      family_notification_status TEXT NOT NULL DEFAULT '',
      family_notification_to TEXT NOT NULL DEFAULT '',
      family_notification_message TEXT NOT NULL DEFAULT '',
      family_notification_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_care_visits_patient ON care_visits(patient_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_care_visits_open ON care_visits(patient_id) WHERE finished_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_care_visits_planned ON care_visits(planned_visit_id) WHERE planned_visit_id IS NOT NULL;
  `);
}

const demoPatients = [
  {
    key: 'marija-horvat',
    first_name: 'Marija',
    last_name: 'Horvat',
    date_of_birth: '1941-03-12',
    address: 'Ulica kralja Tomislava 12, Čazma',
    phone: '091 200 1001',
    family_contact_name: 'Ana Horvat, kći',
    family_contact_phone: '091 300 1001',
    allergies: 'Penicilin',
    diagnoses: 'Hipertenzija, šećerna bolest tip 2',
    risks: 'Rizik pada, povremena vrtoglavica',
    mobility_note: 'Hoda uz hodalicu. Potrebna pomoć pri izlasku iz kreveta.',
    access_note: 'Zvono ne radi uvijek. Nazvati kćer ako ne otvara.',
    notes: 'Jutarnja njega, kontrola šećera, podsjetnik na terapiju.'
  },
  {
    key: 'ivan-kovac',
    first_name: 'Ivan',
    last_name: 'Kovač',
    date_of_birth: '1938-11-02',
    address: 'Moslačka 8, Čazma',
    phone: '091 200 1002',
    family_contact_name: 'Marko Kovač, sin',
    family_contact_phone: '091 300 1002',
    allergies: '',
    diagnoses: 'KOPB, kronično srčano zatajenje',
    risks: 'Dispneja pri naporu, kontrolirati SpO2',
    mobility_note: 'Kreće se sporo, treba pauze.',
    access_note: 'Ključ kod susjede desno ako se ne javlja.',
    notes: 'Provjera disanja, SpO2 i općeg stanja.'
  },
  {
    key: 'ana-babic',
    first_name: 'Ana',
    last_name: 'Babić',
    date_of_birth: '1952-07-19',
    address: 'Vinogradska 21, Čazma',
    phone: '091 200 1003',
    family_contact_name: 'Ivana Babić, unuka',
    family_contact_phone: '091 300 1003',
    allergies: 'Lateks',
    diagnoses: 'Stanje nakon CVI, slabost desne strane',
    risks: 'Aspiracija, otežan transfer',
    mobility_note: 'Transfer uz pomoć jedne osobe. Koristi kolica za duže kretanje.',
    access_note: 'Ulaz prizemlje, bez stepenica.',
    notes: 'Vježbe mobilnosti i procjena kože.'
  },
  {
    key: 'stjepan-novak',
    first_name: 'Stjepan',
    last_name: 'Novak',
    date_of_birth: '1947-01-28',
    address: 'Bjelovarska 4, Čazma',
    phone: '091 200 1004',
    family_contact_name: 'Petra Novak, supruga',
    family_contact_phone: '091 300 1004',
    allergies: '',
    diagnoses: 'Dekubitus sakralno područje, pothranjenost',
    risks: 'Rana, rizik infekcije',
    mobility_note: 'Većinom leži. Okretanje svaka 2 sata prema planu obitelji.',
    access_note: 'Pas u dvorištu, nazvati prije ulaska.',
    notes: 'Previjanje rane, kontrola kože, edukacija obitelji.'
  },
  {
    key: 'kata-radic',
    first_name: 'Kata',
    last_name: 'Radić',
    date_of_birth: '1935-09-05',
    address: 'Trg čazmanskog kaptola 3, Čazma',
    phone: '091 200 1005',
    family_contact_name: 'Maja Radić, kći',
    family_contact_phone: '091 300 1005',
    allergies: '',
    diagnoses: 'Demencija, osteoporoza',
    risks: 'Zaboravljivost, rizik lutanja',
    mobility_note: 'Hoda samostalno po stanu, nadzor pri izlasku.',
    access_note: 'Obitelj ostavlja ključ u sefu kod vrata. Šifra za demo: 1234.',
    notes: 'Nadzor uzimanja terapije i hidracije.'
  }
];

async function clearExistingDemo(client) {
  const found = await client.query(
    `SELECT id FROM patients WHERE tenant_id=$1 AND notes LIKE $2`,
    [TENANT_ID, DEMO_MARKER + '%']
  );
  const ids = found.rows.map(r => Number(r.id)).filter(Boolean);
  if (!ids.length) return 0;
  await client.query('DELETE FROM care_visits WHERE tenant_id=$1 AND patient_id = ANY($2::bigint[])', [TENANT_ID, ids]);
  await client.query('DELETE FROM planned_visits WHERE tenant_id=$1 AND patient_id = ANY($2::bigint[])', [TENANT_ID, ids]);
  await client.query('DELETE FROM patients WHERE tenant_id=$1 AND id = ANY($2::bigint[])', [TENANT_ID, ids]);
  return ids.length;
}

async function insertPatients(client) {
  const byKey = new Map();
  for (const p of demoPatients) {
    const saved = await client.query(
      `INSERT INTO patients (
        tenant_id, first_name, last_name, date_of_birth, address, phone,
        family_contact_name, family_contact_phone, notes, scan_code,
        allergies, diagnoses, risks, mobility_note, access_note, active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE)
      RETURNING id, first_name, last_name, scan_code`,
      [
        TENANT_ID,
        p.first_name,
        p.last_name,
        p.date_of_birth,
        p.address,
        p.phone,
        p.family_contact_name,
        p.family_contact_phone,
        DEMO_MARKER + ' ' + p.notes,
        code(p.key),
        p.allergies,
        p.diagnoses,
        p.risks,
        p.mobility_note,
        p.access_note
      ]
    );
    byKey.set(p.key, saved.rows[0]);
  }
  return byKey;
}

async function insertPlannedVisits(client, patients) {
  const planned = [
    ['marija-horvat', plusHours(1), '08:30 - 09:30', 'Jutarnja njega', 'Kontrola šećera, krvni tlak, podsjetnik na terapiju.'],
    ['ivan-kovac', plusHours(2), '10:00 - 11:00', 'Kontrola stanja', 'Provjeriti disanje, SpO2 i umor pri hodu.'],
    ['ana-babic', plusHours(4), '12:00 - 13:00', 'Mobilnost i njega', 'Pomoć pri transferu, procjena kože, kratke vježbe.'],
    ['stjepan-novak', plusDays(0, 15, 30), '15:00 - 16:00', 'Previjanje rane', 'Pripremiti materijal za previjanje, zabilježiti izgled rane.'],
    ['kata-radic', plusDays(1, 9, 0), '09:00 - 10:00', 'Nadzor terapije', 'Provjeriti terapiju, hidraciju i orijentaciju.']
  ];

  const ids = new Map();
  for (const row of planned) {
    const patient = patients.get(row[0]);
    if (!patient) continue;
    const saved = await client.query(
      `INSERT INTO planned_visits (tenant_id, patient_id, planned_for, window_text, visit_type, instructions, status)
       VALUES ($1,$2,$3,$4,$5,$6,'planned') RETURNING id`,
      [TENANT_ID, patient.id, row[1], row[2], row[3], DEMO_MARKER + ' ' + row[4]]
    );
    ids.set(row[0], saved.rows[0].id);
  }
  return ids;
}

async function insertVisits(client, patients, plannedIds) {
  const marija = patients.get('marija-horvat');
  const ivan = patients.get('ivan-kovac');
  const stjepan = patients.get('stjepan-novak');

  if (marija) {
    await client.query(
      `INSERT INTO care_visits (
        tenant_id, patient_id, planned_visit_id, started_by_name, started_at, start_note
      ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [TENANT_ID, marija.id, plannedIds.get('marija-horvat') || null, 'Demo sestra', plusHours(-0.5), DEMO_MARKER + ' Posjeta u tijeku - kontrola šećera i jutarnja njega.']
    );
  }

  if (ivan) {
    await client.query(
      `INSERT INTO care_visits (
        tenant_id, patient_id, planned_visit_id, started_by_name, started_at,
        finished_by_name, finished_at, start_note, finish_note,
        performed_procedures, care_plan_done, therapy_done, bp, pulse, temperature, spo2, pain_score,
        family_notification_requested, family_notification_status, family_notification_to, family_notification_message, family_notification_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,TRUE,$18,$19,$20,$21)`,
      [
        TENANT_ID,
        ivan.id,
        plannedIds.get('ivan-kovac') || null,
        'Demo sestra',
        plusHours(-4),
        'Demo sestra',
        plusHours(-3.25),
        DEMO_MARKER + ' Pacijent se žali na umor pri hodu.',
        'Stanje stabilno, savjetovana pauza pri naporu.',
        'Kontrola vitalnih znakova; procjena disanja',
        'Provjeren plan njege i sigurnost kretanja',
        'Inhalacijska terapija prema uputi obitelji potvrđena',
        '135/78',
        '82',
        '36.6',
        '94%',
        '2',
        'spremno',
        ivan.family_contact_phone || '091 300 1002',
        'Njega za Ivana Kovača je završena. Stanje stabilno. SpO2 94%, TA 135/78. Savjetovana pauza pri naporu.',
        plusHours(-3.2)
      ]
    );
  }

  if (stjepan) {
    await client.query(
      `INSERT INTO care_visits (
        tenant_id, patient_id, started_by_name, started_at,
        finished_by_name, finished_at, start_note, finish_note,
        performed_procedures, procedure_note, care_plan_done, wound_note, pain_score
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        TENANT_ID,
        stjepan.id,
        'Demo sestra',
        plusDays(-1, 15, 5),
        'Demo sestra',
        plusDays(-1, 15, 45),
        DEMO_MARKER + ' Kontrola rane i kože.',
        'Rana bez vidljivog pogoršanja. Obitelj educirana o okretanju.',
        'Previjanje; procjena kože; edukacija obitelji',
        'Sterilno previjanje prema planu.',
        'Okretanje, njega kože, kontrola unosa tekućine',
        'Sakralno područje: rubovi mirni, bez novog crvenila.',
        '3'
      ]
    );
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureTables(client);
    const removed = await clearExistingDemo(client);
    const patients = await insertPatients(client);
    const plannedIds = await insertPlannedVisits(client, patients);
    await insertVisits(client, patients, plannedIds);
    await client.query('COMMIT');

    console.log('Demo podaci su spremni.');
    console.log('Tenant:', TENANT_ID);
    console.log('Obrisano starih demo pacijenata:', removed);
    console.log('Dodano demo pacijenata:', patients.size);
    console.log('Demo QR/NFC linkovi:');
    for (const patient of patients.values()) {
      console.log('- ' + patient.first_name + ' ' + patient.last_name + ': http://localhost:5056/#scan?t=' + encodeURIComponent(patient.scan_code));
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Demo seed nije uspio:', err.message || err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
