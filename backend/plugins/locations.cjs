// backend/plugins/locations.cjs
// Handles: /locations CRUD + /qrcodes (legacy SPA-compatible)

module.exports = function setupLocations(opts = {}) {
  const {
    app,
    pool,
    auth,
    tenantIdOf = (req) => Number(req.user?.tenant_id || 0),
    requireAdmin,
    rowsToCsv,
  } = opts;

  if (!app || !pool || !auth) {
    throw new Error("[locations] Missing { app, pool, auth }");
  }
  if (!tenantIdOf) {
    throw new Error("[locations] Missing tenantIdOf");
  }
  if (!requireAdmin) {
    throw new Error("[locations] Missing requireAdmin");
  }

  // Prefer rowsToCsv from opts, otherwise try app.locals.rowsToCsv
  const toCsv =
    rowsToCsv ||
    (app.locals && app.locals.rowsToCsv) ||
    ((rows) => rows);

  // -------- Helpers --------
  function makeTokenString() {
    return (
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 6)
    );
  }

  /* ================= LOCATIONS ================= */

  app.get("/locations", auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req) || 1;
      const { rows } = await pool.query(
        "SELECT id, name, type, active FROM locations WHERE tenant_id = $1 ORDER BY id",
        [tid]
      );

      // CSV export support ?csv=1 same as old server
      if (String((req.query || {}).csv || "") === "1") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=locations.csv"
        );
        return res.send(toCsv(rows));
      }

      return res.json({ items: rows || [] });
    } catch (e) {
      console.error("[GET /locations] error:", e);
      // Don't break the SPA – just return empty list on error
      return res.json({ items: [] });
    }
  });

  app.post("/locations", auth, async (req, res) => {
    try {
      const body = req.body || {};

      // Accept multiple possible keys from SPA
      const rawName =
        body.name ||
        body.title ||
        body.label ||
        body.location_name ||
        body.location ||
        "";

      let rawType =
        body.type ||
        body.kind ||
        body.category ||
        body.loc_type ||
        "";

      let name = String(rawName).trim();
      let type = String(rawType).trim().toUpperCase();

      // NEVER 400 just because of name/type – generate defaults
      if (!name) {
        name = "Location " + Date.now();
      }
      if (!type) {
        type = "ROOM";
      }

      const tid = tenantIdOf(req) || 1;

      const { rows } = await pool.query(
        "INSERT INTO locations(tenant_id,name,type,active) VALUES ($1,$2,$3,TRUE) RETURNING id",
        [tid, name, type]
      );

      return res.json({ id: rows[0].id, name, type });
    } catch (e) {
      console.error("[POST /locations] error, body =", req.body, "err =", e);
      return res.status(500).json({ error: "locations insert failed" });
    }
  });

      // Update a location (name / type / active)
  app.patch("/locations/:id", auth, async (req, res) => {
    try {
      const tid = tenantIdOf(req) || 1;
      const id = Number(req.params.id || 0) || 0;

      if (!id || !tid) {
        return res.status(400).json({ error: "Invalid tenant or id" });
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      let { name, type, active } = body;

      const sets = [];
      const vals = [];
      let i = 1;

      if (typeof name === "string") {
        name = name.trim();
        if (!name) {
          return res.status(400).json({ error: "Name cannot be empty." });
        }
        sets.push(`name = $${i++}`);
        vals.push(name);
      }

      if (typeof type === "string") {
        type = type.trim();
        if (type) {
          sets.push(`type = $${i++}`);
          vals.push(type);
        }
      }

      if (typeof active === "boolean") {
        sets.push(`active = $${i++}`);
        vals.push(active);
      }

      if (!sets.length) {
        // nothing to update
        return res.json({ ok: true });
      }

      // WHERE id + tenant_id to keep tenant scoping
      vals.push(id);
      vals.push(tid);

      const sql = `
        UPDATE locations
           SET ${sets.join(", ")}
         WHERE id = $${i++}
           AND tenant_id = $${i}
         RETURNING id, name, type, active
      `;

      const { rows } = await pool.query(sql, vals);
      if (!rows.length) {
        return res.status(404).json({ error: "Location not found." });
      }

      return res.json(rows[0]);
    } catch (e) {
      console.error("[PATCH /locations/:id] error", e);
      return res.status(500).json({ error: "Failed to update location." });
    }
  });


  app.delete("/locations/:id", auth, async (req, res) => {
    const tid = tenantIdOf(req) || 1;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM qrcodes WHERE location_id=$1 AND tenant_id=$2",
        [req.params.id, tid]
      );
      await client.query(
        "DELETE FROM locations WHERE id=$1 AND tenant_id=$2",
        [req.params.id, tid]
      );
      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("[DELETE /locations/:id] error:", e);
      return res.status(500).json({ error: "delete failed" });
    } finally {
      client.release();
    }
  });

  /* ================= QR / NFC ================= */

  app.post("/qrcodes", auth, requireAdmin, async (req, res) => {
    try {
      const tid = tenantIdOf(req) || 1;
      const body = req.body || {};

      // Accept multiple possible keys from SPA
      const rawLocId =
        body.locationId ||
        body.location_id ||
        body.location ||
        body.id ||
        body.locId;

      let locationId = Number(rawLocId) || 0;
      let locRow;

      if (!locationId) {
        // Fallback: pick ANY location for this tenant if SPA didn't send id
        const { rows } = await pool.query(
          "SELECT id, tenant_id, type FROM locations WHERE tenant_id = $1 ORDER BY id LIMIT 1",
          [tid]
        );
        if (!rows.length) {
          return res.status(400).json({ error: "no locations available" });
        }
        locRow = rows[0];
        locationId = locRow.id;
      } else {
        // Ensure location belongs to this tenant
        const { rows } = await pool.query(
          "SELECT id, tenant_id, type FROM locations WHERE id=$1 AND tenant_id=$2",
          [locationId, tid]
        );
        if (!rows.length) {
          return res.status(404).json({ error: "no location" });
        }
        locRow = rows[0];
      }

      const tok = makeTokenString();
      await pool.query(
        "INSERT INTO qrcodes(token,location_id,tenant_id) VALUES ($1,$2,$3)",
        [tok, locationId, tid]
      );

      // Compute public base (prefer env, otherwise from proxy/req)
      const xfProto =
        (req.headers["x-forwarded-proto"] || "").split(",")[0] || "";
      const proto = xfProto || (req.secure ? "https" : req.protocol || "http");
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const computed = `${proto}://${host}`;
      const base = (process.env.PUBLIC_API_URL || computed).replace(/\/+$/, "");

      const tapAuto = `${base}/tap/u/${tok}`;

      const type = String(locRow.type || "").trim().toUpperCase();

      const urlTapRoom = `${base}/tap/nursing/room/${tok}`;
      const urlTapAsset = `${base}/tap/nursing/asset/${tok}`;
      const urlTapFridge = `${base}/tap/fridge/${tok}`;
      const urlTapFire = `${base}/tap/fire/${tok}`;
      const urlTapCi = `${base}/tap/ci/${tok}`;

      let tap = tapAuto;
      switch (type) {
        case "ROOM":
          tap = urlTapRoom;
          break;
        case "ASSET":
          tap = urlTapAsset;
          break;
        case "FRIDGE":
          tap = urlTapFridge;
          break;
        case "FIRE":
          tap = urlTapFire;
          break;
        default:
          tap = tapAuto;
          break;
      }

      return res.json({
        token: tok,
        urlTap: tap,
        urlTapAuto: tapAuto,
        urlTapCi,
        urlTapRoom,
        urlTapAsset,
        urlTapFridge,
        urlTapFire,
      });
    } catch (e) {
      console.error("[POST /qrcodes] error, body =", req.body, "err =", e);
      return res.status(500).json({ error: "qrcodes failed" });
    }
  });

  console.log("[locations] /locations and /qrcodes routes registered");
};
