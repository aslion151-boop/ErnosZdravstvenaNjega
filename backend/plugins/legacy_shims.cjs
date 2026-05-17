// backend/plugins/legacy_shims.cjs
// Legacy shims for old SPA behaviour (ff summary + empty attachments)

module.exports = function setupLegacyShims(opts = {}) {
  const { app, auth } = opts;

  if (!app || !auth) {
    throw new Error("[legacy_shims] Missing { app, auth }");
  }

  // FF summary shim for old SPA dashboards
  // Must be registered BEFORE fridge_fire plugin so this handler wins.
  app.get("/ff/summary", auth, (req, res) => {
    return res.json({
      fridges: [],
      fire: [],
      has_alerts: false,
    });
  });

  // Attachments stub – keep for SPA, always empty list
  app.get("/issues/:id/attachments", auth, async (req, res) => {
    return res.json({ items: [] });
  });

  console.log("[legacy_shims] /ff/summary and /issues/:id/attachments registered");
};
