# Sales performance changes — 2026-11-08

## Scope

Applied to the active local SODA repositories. No database schema changes, index creation, public deployment or data writes were performed by the benchmarks.

- `compression`: gzip-compatible compression on `/api/sales` responses over 1 KiB, level 4. Auth responses and uploads are not included.
- `lru-cache`: response cache only for authenticated `/report` and `/filters`, after tenant resolution. Key includes tenant, complete authenticated user context (including role and scope), endpoint, canonical query and per-tenant revision. TTL 30 seconds; maximum 200 entries / approximately 32 MiB, maximum entry 4 MiB. Errors and oversized entries bypass retention.
- Cache invalidation after successful commits in both sales importers, both LASKA dictionary importers and legacy OLGATORG sale mutation methods. Revision checks prevent a pre-import in-flight request repopulating the cache. Across separate server processes, caches expire within 30 seconds; invalidation is process-local.
- LASKA admin dictionaries with only date filters use one aggregate scan instead of eight queries. Other requests retain per-field dropdown behavior. Mandatory agent, supervisor and brand-manager restrictions are reapplied after removing UI selections.
- Authentication still runs for every cache hit. No authentication or permission cache was introduced.

## Frontend

- TanStack Query already existed. Sales filter requests now debounce for 250 ms and consume AbortSignal. Report requests consume AbortSignal, too. Both query keys include user scope and tenant; unwanted focus refetches are disabled. Five-minute client freshness is unchanged. A report refresh action invalidates filter queries and refetches the report; server cache may still serve a result younger than 30 seconds unless an import invalidated it.
- TanStack Virtual renders only the viewport and overscan for more than 200 expanded table rows, measures variable row heights and preserves stable row identity. Sorting, collapsing and grand totals still use the complete data set. Excel receives the entire sorted tree, including collapsed and offscreen rows. Browser printing switches virtualization off before print.
- Excel preparation is scheduled during idle time, with cancellation and a timer fallback, so the first table render is not immediately followed by workbook construction. The prepared file is still ready before the mobile share action.
- `pg-cursor` was deliberately not installed: there is no server-side streaming export in the current flow. Excel is built on the client from aggregated report rows; a cursor would not remove this work.

## Measurements

Real authenticated HTTP requests to local backend, three sequential samples per endpoint before and after. LASKA: 2026-10-01 through 2026-11-04, 1,604 report rows. OLGATORG: 2026-07-01 through 2026-07-31, 284 rows. Report grouping: brand,product. Times include authentication and Neon network access. These are spot checks, not a concurrency load test or a production SLA.

| Endpoint | Before, repeated requests | After, cache hits | Before wire bytes | After gzip bytes |
| --- | --- | --- | --- | --- |
| LASKA report | 576–653 ms | 64–73 ms | 855,227 | 98,702 |
| LASKA filters | 596–1,675 ms | 52–55 ms | 374,169 | 97,373 |
| OLGATORG report | 139–148 ms | 39–41 ms | 159,886 | 14,161 |
| OLGATORG filters | 205–231 ms | 43–44 ms | 216,149 | 50,785 |

Final cache-miss samples: LASKA filters 1,198 ms, LASKA report 741 ms, OLGATORG filters 436 ms and report 154 ms. First uncached report latency is not materially improved; the main proven gains are repeated reads, transmitted bytes and rendered row count. Do not compare a cache hit to a cold first request without this distinction.

All decoded JSON SHA-256 values matched the before samples for the tested admin requests. Numeric values, order and row counts were unchanged.

Controlled React server-render benchmark, same component/data with virtualization toggled (not browser paint or FPS):

| Input rows | Before rendered rows | After rendered rows | Before median render | After median render |
| --- | --- | --- | --- | --- |
| 1,604 | 1,604 | 19 | 908 ms | 49 ms |
| 10,000 | 10,000 | 19 | 4,065 ms | 225 ms |

Actual viewport row count varies with screen height and measured row sizes. Browser scroll/paint profiling was unavailable because the desktop browser automation runtime failed to initialize.

## Limits and next candidates

- Large unfiltered reports still execute complete authorized aggregations; the cache is deliberately bounded and bypasses oversized responses.
- Existing date and normalized dictionary-name indexes were inspected; no additional index was installed without evidence that it would help.
- For further first-request improvement, profile production-like groupings with EXPLAIN ANALYZE and measure workbook generation on a physical mobile device. A backend export endpoint would be the point at which pg-cursor becomes relevant.

Documentation: [TanStack Virtual](https://tanstack.com/virtual/latest/docs/framework/react/examples/table), [TanStack Query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation), [lru-cache](https://isaacs.github.io/node-lru-cache/), [Express compression](https://expressjs.com/en/resources/middleware/compression/).
