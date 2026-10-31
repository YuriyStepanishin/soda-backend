# Daily sales and tenant isolation

Both registered adapters implement `/api/sales/by-days` and `/api/sales/by-days/filters`. Daily aggregates scan sales once, group by date and stable outlet code (name fallback), then calculate amount, weight, outlet count and outlets with a net daily amount of at least 500. Dates are returned as YYYY-MM-DD text, independent of the Node process timezone. Returns remain signed in amount and weight. Period/week outlet totals in the UI are sums of daily outlet counts.

LASKA queries its numeric sales columns directly and joins the agent/product dictionaries only when filters require them. The filter endpoint loads only departments, agents and brands. Mandatory role restrictions are reapplied after dropping a dictionary's own UI filter.

The client starts with eight previous weeks plus the current week, using the Kyiv calendar. Users can change the dates. Query keys include the company and normalized brand arrays, obsolete requests consume AbortSignal, and switching company cancels requests, clears cached results and returns home. Admin must explicitly select a working company after login or page reload. `tenantAdmin` is the authentication credential store and is never used as a working-company default. Ordinary users retain their assigned company.

Malformed, comma-joined, duplicate and array tenant headers are rejected before authentication. Data operations use only the selected company's sales adapter. Startup no longer probes both databases. Admin identity/password verification still uses the configured central credential store; this is separate from sales data routing and is deliberately retained to preserve account revocation and current DB-role checks.

## Validation (2026-10-31)

Read-only EXPLAIN (ANALYZE, BUFFERS) on LASKA, 2026-08-31 through 2026-10-31:

- Original first run: 10,133.932 ms (cold/cache effects).
- Original repeated run: 2,183.632 ms.
- Final query: 808.676 ms, 61 days (about 2.7x faster than the repeated original run).
- A full outer comparison found zero mismatches in daily amount, weight and outlet count.

These are individual database execution measurements, not browser/API latency guarantees; network, concurrent load, and cache state affect end-to-end timing. No production schema or data were modified by these checks.

20 backend tests pass, covering both adapters, tenant rejection, mandatory company selection, scope-preserving filters and both import cleanup workflows. Frontend production build and ESLint on changed files pass. A React DOM interaction check with mocked HTTP verified no sales requests before admin selection, company-specific headers, independent LASKA/OLGATORG results and selection after remount. A full browser binary could not be downloaded in this environment. Repository-wide frontend lint still reports pre-existing errors in StoreCheckReviewPage, useMessagesCenter and the JSX-containing constants/version.js.

Deploy the backend before the frontend, since the client uses the new filter endpoint.
