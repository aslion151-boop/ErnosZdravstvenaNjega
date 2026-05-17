async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function init() {
  const statusEl = document.getElementById('status');
  const tablesSel = document.getElementById('tables');
  const loadBtn = document.getElementById('load');
  const content = document.getElementById('content');
  const errorEl = document.getElementById('error');

  // health
  try {
    const h = await getJSON('/health');
    statusEl.textContent = h.ok ? 'server ok' : 'server error';
  } catch {
    statusEl.textContent = 'server error';
  }

  // tables
  try {
    const t = await getJSON('/tables');
    tablesSel.innerHTML = '';
    for (const name of t.tables) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      tablesSel.appendChild(opt);
    }
  } catch (e) {
    errorEl.textContent = 'Failed to load tables: ' + e.message;
    return;
  }

  loadBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    content.textContent = 'Loading…';
    const table = tablesSel.value;
    try {
      const data = await getJSON(`/table/${encodeURIComponent(table)}`);
      const rows = data.rows || [];
      if (rows.length === 0) {
        content.innerHTML = `<p class="muted">No rows in <b>${table}</b> (showing up to 25).</p>`;
        return;
      }
      const cols = Object.keys(rows[0]);
      let html = '<table><thead><tr>';
      for (const c of cols) html += `<th>${c}</th>`;
      html += '</tr></thead><tbody>';
      for (const r of rows) {
        html += '<tr>';
        for (const c of cols) html += `<td>${r[c] ?? ''}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table>';
      content.innerHTML = html;
    } catch (e) {
      errorEl.textContent = 'Error loading rows: ' + e.message;
      content.innerHTML = '';
    }
  });
}

init();
