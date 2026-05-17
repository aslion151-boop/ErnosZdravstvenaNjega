// server.mjs
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "pg";

dotenv.config();
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json()); // <-- needed for POST JSON
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Check your .env file.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// helpers
const qi = (id) => `"${String(id).replace(/"/g, '""')}"`;

let cachedTables = null;
async function getAllTables() {
  const sql = `
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog','information_schema')
    ORDER BY schemaname, tablename
  `;
  const { rows } = await pool.query(sql);
  return rows.map(r => ({ schema: r.schemaname, name: r.tablename, fq: `${r.schemaname}.${r.tablename}` }));
}
function normalizeTable(requested, tables) {
  const target = requested.includes(".") ? requested : `public.${requested}`;
  const found = tables.find(t => t.fq.toLowerCase() === target.toLowerCase());
  if (!found) throw new Error(`Table not found or not allowed: ${requested}`);
  return found;
}
async function getColumns(schema, name) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default, is_identity
     FROM information_schema.columns
     WHERE table_schema=$1 AND table_name=$2
     ORDER BY ordinal_position`,
     [schema, name]
  );
  return rows;
}

// health
app.get("/health", (_req, res) => res.type("text").send("server ok"));

// tiny viewer (home)
app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html><head>
  <meta charset="utf-8"/>
  <title>Ernos DB Viewer</title>
  <style>
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:1000px;margin:40px auto;padding:0 16px}
    h1{margin:0 0 6px}
    .row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}
    select,button,input{font-size:14px;padding:6px 8px}
    table{border-collapse:collapse;margin-top:16px;width:100%}
    th,td{border:1px solid #ddd;padding:6px 8px;font-size:13px}
    th{background:#f5f5f5;text-align:left}
    .muted{color:#666;font-size:13px}
  </style>
</head>
<body>
  <h1>Ernos DB Viewer</h1>
  <div class="muted">Server: <span id="health">checking…</span></div>

  <div class="row" style="margin-top:12px">
    <label>
      <div class="muted">Tables</div>
      <select id="tables"></select>
    </label>
    <button id="load">Load rows</button>
    <button id="cols">Show columns</button>
    <span id="status" class="muted"></span>
  </div>

  <pre id="colsBox" style="background:#fafafa;border:1px solid #eee;padding:8px;display:none"></pre>
  <div id="tableWrap"></div>

<script>
async function checkHealth(){
  try{ document.getElementById('health').textContent = await fetch('/health').then(r=>r.text()); }
  catch{ document.getElementById('health').textContent = 'unreachable'; }
}
async function loadTables(){
  const sel = document.getElementById('tables');
  const st = document.getElementById('status');
  st.textContent = 'loading tables…';
  sel.innerHTML = '';
  try{
    const tables = await fetch('/tables').then(r=>r.json());
    tables.forEach(t=>{
      const opt = document.createElement('option');
      opt.value = t.fq;
      opt.textContent = (t.schema==='public') ? t.name : t.fq;
      sel.appendChild(opt);
    });
    st.textContent = tables.length ? '' : 'no tables found';
  }catch(e){ st.textContent = 'Failed to load tables: ' + e.message; }
}
async function loadRows(){
  const sel = document.getElementById('tables');
  const st = document.getElementById('status');
  const wrap = document.getElementById('tableWrap');
  const t = sel.value;
  if(!t){ st.textContent='pick a table'; return; }
  st.textContent='loading rows…'; wrap.innerHTML='';
  try{
    const data = await fetch('/rows?table='+encodeURIComponent(t)).then(r=>r.json());
    const rows = data.rows||[];
    if(!rows.length){ st.textContent='0 rows'; return; }
    const cols = Object.keys(rows[0]);
    const head = '<tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr>';
    const body = rows.map(r => '<tr>'+cols.map(c => '<td>'+String(r[c] ?? '')+'</td>').join('')+'</tr>').join('');
    wrap.innerHTML = '<table>'+head+body+'</table>';
    st.textContent = 'showing '+rows.length+' rows';
  }catch(e){ st.textContent='Failed to load rows: '+e.message; }
}
async function showColumns(){
  const box = document.getElementById('colsBox');
  const sel = document.getElementById('tables');
  const t = sel.value;
  box.style.display='block';
  box.textContent = 'loading…';
  try{
    const data = await fetch('/columns?table='+encodeURIComponent(t)).then(r=>r.json());
    box.textContent = JSON.stringify(data, null, 2);
  }catch(e){ box.textContent = 'Failed to load columns: '+e.message; }
}
document.getElementById('load').addEventListener('click', loadRows);
document.getElementById('cols').addEventListener('click', showColumns);
checkHealth().then(loadTables);
</script>
</body></html>`);
});

// list tables
app.get("/tables", async (_req, res) => {
  try {
    cachedTables = await getAllTables();
    res.json(cachedTables);
  } catch (e) {
    console.error("Error /tables:", e);
    res.status(500).json({ error: e.message });
  }
});

// first 25 rows
app.get("/rows", async (req, res) => {
  try {
    const requested = (req.query.table || "").trim();
    if (!requested) return res.status(400).json({ error: "Missing ?table=" });
    if (!cachedTables) cachedTables = await getAllTables();
    const t = normalizeTable(requested, cachedTables);
    const sql = `SELECT * FROM ${qi(t.schema)}.${qi(t.name)} LIMIT 25`;
    const { rows } = await pool.query(sql);
    res.json({ table: t.fq, rows });
  } catch (e) {
    console.error("Error /rows:", e);
    res.status(500).json({ error: e.message });
  }
});

// NEW: columns for a table
app.get("/columns", async (req, res) => {
  try {
    const requested = (req.query.table || "").trim();
    if (!requested) return res.status(400).json({ error: "Missing ?table=" });
    if (!cachedTables) cachedTables = await getAllTables();
    const t = normalizeTable(requested, cachedTables);
    const cols = await getColumns(t.schema, t.name);
    res.json({ table: t.fq, columns: cols });
  } catch (e) {
    console.error("Error /columns:", e);
    res.status(500).json({ error: e.message });
  }
});

// NEW: insert a row { table:"public.users", row:{...} }
app.post("/insert", async (req, res) => {
  try {
    const { table, row } = req.body || {};
    if (!table || !row || typeof row !== "object") {
      return res.status(400).json({ error: 'Body must be { "table": "schema.table", "row": { ... } }' });
    }
    if (!cachedTables) cachedTables = await getAllTables();
    const t = normalizeTable(table, cachedTables);
    const colsMeta = await getColumns(t.schema, t.name);
    const validCols = new Set(colsMeta.map(c => c.column_name));

    const keys = Object.keys(row).filter(k => validCols.has(k));
    if (!keys.length) return res.status(400).json({ error: "No valid column names in 'row'." });

    const placeholders = keys.map((_, i) => `$${i+1}`);
    const values = keys.map(k => row[k]);

    const sql = `INSERT INTO ${qi(t.schema)}.${qi(t.name)} (${keys.map(qi).join(",")})
                 VALUES (${placeholders.join(",")})
                 RETURNING *`;
    const { rows } = await pool.query(sql, values);
    res.json({ inserted: rows[0] });
  } catch (e) {
    console.error("Error /insert:", e);
    res.status(500).json({ error: e.message });
  }
});
// --- Simple API for your app ---

// POST /api/login  -> very basic (demo only; no hashing)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    const q = `
      SELECT id, name, email, role, category, title
      FROM users
      WHERE email = $1 AND password = $2
      LIMIT 1
    `;
    const { rows } = await pool.query(q, [email, password]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'login failed' });
  }
});

// GET /api/locations -> list first 100 locations
app.get('/api/locations', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM locations ORDER BY id DESC LIMIT 100`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load locations' });
  }
});
// POST /api/login  (demo only: plaintext check)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    const q = `
      SELECT id, name, email, role, category, title
      FROM users
      WHERE email = $1 AND password = $2
      LIMIT 1
    `;
    const { rows } = await pool.query(q, [email, password]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'login failed' });
  }
});

// GET /api/locations -> list first 100 locations
app.get('/api/locations', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM locations ORDER BY id DESC LIMIT 100`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load locations' });
  }
});

// start
app.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  try {
    const { rows } = await pool.query("select current_user, current_database()");
    console.log(`Connected as ${rows[0].current_user} to ${rows[0].current_database}`);
  } catch (e) {
    console.error("DB connection check failed:", e);
  }
});
