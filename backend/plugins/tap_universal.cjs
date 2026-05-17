// backend/plugins/tap_universal.cjs
// Universal TAP helpers.
// 1) /tap/u/:token      → HTTP redirect to appropriate public tap page (if you use it)
// 2) /tap/resolve/:token → JSON info about token (kind/type) for frontend hash routing

module.exports = function setupTapUniversal(opts = {}) {
  const {
    app,
    pool,
    normalizeToken = (x) => String(x || "").trim(),
  } = opts;

  if (!app || !pool) {
    throw new Error("[tap_universal] Missing { app, pool }");
  }

  async function resolveToken(rawToken) {
    const token = normalizeToken(rawToken);
    if (!token) return null;

    const { rows } = await pool.query(
      `
      SELECT
        q.token,
        COALESCE(q.kind, '') AS kind,
        COALESCE(l.type, '') AS type
      FROM qrcodes q
      LEFT JOIN locations l ON l.id = q.location_id
      WHERE q.token = $1
      LIMIT 1
      `,
      [token]
    );

    const row = rows[0];
    if (!row) return null;

    return {
      token: row.token,
      kind: (row.kind || "").toUpperCase(),
      type: (row.type || "").toUpperCase(),
    };
  }

  // 1) Optional universal redirect router: /tap/u/:token
  //    (If your tags ever use /tap/u/<token>)
  app.get("/tap/u/:rawToken", async (req, res) => {
    try {
      const rawToken = String(req.params.rawToken || "").trim();
      const info = await resolveToken(rawToken);
      if (!info) return res.status(404).send("Unknown tap token");

      const t = encodeURIComponent(info.token);

      // Reception – VISITORS
      if (info.type === "RECEPTION_VISITORS" || info.kind === "VISITOR") {
        return res.redirect(302, `/tap/visitor/${t}`);
      }

      // Reception – RESIDENTS
      if (info.type === "RECEPTION_RESIDENTS" || info.kind === "RESIDENT") {
        return res.redirect(302, `/tap/resident/${t}`);
      }

      // Fallback → home (or later, other types)
      return res.redirect(302, "/");
    } catch (e) {
      console.error("[/tap/u/:token] error:", e);
      return res.status(500).send("Server error");
    }
  });

  // 2) JSON resolver: /tap/resolve/:token
  //    Used by frontend to decide where to send #report?token=... for special types
  app.get("/tap/resolve/:rawToken", async (req, res) => {
    try {
      const rawToken = String(req.params.rawToken || "").trim();
      const info = await resolveToken(rawToken);
      if (!info) {
        return res.status(404).json({ ok: false, error: "unknown token" });
      }
      return res.json({
        ok: true,
        token: info.token,
        kind: info.kind,
        type: info.type,
      });
    } catch (e) {
      console.error("[/tap/resolve/:token] error:", e);
      return res.status(500).json({ ok: false, error: "server error" });
    }
  });
};
