Ernos Frontend Skin (no-build)
=================================

What this is
------------
A single-folder, no-build frontend you can drop into your server's `FRONTEND_DIR` (defaults to `frontend/`).
It talks to your existing API, stores the JWT in `localStorage.ernosToken`, and uses `localStorage.ernosApi`
as the API base (defaults to your current origin).

What you get
------------
- Clean dark UI
- Login page
- Role-aware navigation
- Dashboard with alerts (tries /ff/alerts first, falls back to /alerts)
- Fridge Logs (Nursing/Admin)
- Fire Logs (Admin)
- Visitors (list + CSV)
- Issues
- QR code generator (Admin)

Install
-------
1) Download the ZIP:
   - ernos-frontend-skin.zip
2) Unzip its contents into your server's `FRONTEND_DIR` directory (default is `frontend/`).
3) Restart the server.
4) Open the app in your browser: https://YOUR-API-OR-DOMAIN/ (or the domain serving your frontend).

Notes
-----
- This app doesn't modify your tap pages (like /tap/fridge/:token). It's purely the main app UI.
- The app expects your API to support the endpoints from your server.pg.cjs and the Fridge/Fire plugin,
  especially /auth/login, /me, /visitors, /issues, /qrcodes, /ff/* endpoints.
- All styling is in styles.css; tweak variables at the top to re-skin instantly.
