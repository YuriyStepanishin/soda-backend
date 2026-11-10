# Дебіторка Ласки

`GET /api/laska/receivables` reads only the LASKA Neon table `laska_receivables`.
The `representatives` query parameter accepts a JSON array of `{agent,route}`
pairs for the combined checkbox filter. Each pair is matched together, under the
mandatory user scope. `statuses` accepts a JSON array of status keys, allowing
several statuses at once. An empty statuses array returns no invoices. An empty
representatives array means all accessible representatives. Legacy single-value
`agent`, `route`, and `status` filters remain supported.
The browser never reads the Drive export. `laska_receivables_sync` records the
source version, report date, import time and control-total discrepancy.

Each returned invoice includes `storeBalance`, the sum of all authorized invoice
balances for that representative, department, route and store. A window aggregate
calculates it before invoice search, status filters and LIMIT/OFFSET, so store
headings retain the full balance on every page. Negative totals display as
prepayment. This field follows the same mandatory agent/department access scope.

## Import

The private SODA_LASKA_Дебіторка folder contains:

```
SODA_LASKA_Дебіторка/
  Uploads/8.xlsx
  Archive/
  Мережі.xlsm
```

Upload a complete 1C export named `8.xlsx`, `8.xls`, or `8` into the dedicated
Uploads folder. Put the network dictionary in the debit folder root,
named `Мережі.xlsm` or `Мережі.xlsx`, with sheet `мережі`: A=ТТ, B=1 for networks.
The initial dictionary is copied from the supplied Д0611.xlsm. VBA is not executed.
Do not put the debit export in the sales Uploads folder.

The private folder ID is stored in `laska_receivables_config` (id=1,
drive_root_id). Override with `LASKA_RECEIVABLES_FOLDER_ID` if necessary. Existing
service-account credentials are reused. Only the owner and that service account
have access. If neither config nor environment is set, the importer supports
discovering a Receivables folder alongside sales Uploads as a fallback.

`LASKA_RECEIVABLES_CRON_ENABLED` defaults to true. The schedule defaults to every
five minutes, Europe/Kyiv, and can be changed with
`LASKA_RECEIVABLES_CRON_SCHEDULE`. Admin/manager may also POST to
`/api/laska/receivables/import` with a Bearer token and `x-tenant-id: laska`.

All rows are parsed and validated before writing. The importer replaces the
entire table with DELETE + INSERT and updates the sync record within one
transaction guarded by an advisory lock. An error rolls back to the old complete
snapshot. Concurrent readers get a complete old or new snapshot. API pagination,
filters, totals and metadata share a repeatable-read transaction. Completed files
are archived only after commit. Failed archive operations retry without repeating
the same import. Newer exports take precedence over older queued files. Source
version and parent are checked again after downloading both workbooks.

## Business rules and access

The parser follows the supplied Зібрати_Дебет macro: read first worksheet from row
13, track ПТТ and ТТ in A, include Реализация товаров и услуг and Возврат товаров
от клиента. Date F, shipped days I, source overdue J, number K, amount L, balance M.
Blank shipped days means zero, as in the 1C export. Blank document amount stays
NULL, while the actual balance is required. Amounts are parsed into integer cents
before database insertion.

Negative balance = Переплата. Positive balance, non-network, days >=14 =
Просрочка; >=21 = Штраф ТП. The 21+ subtotal is included in 14+. Networks are
excluded from both overdue subtotals. The monetary penalty is 1% of the selected
21+ balance, rounded once to two decimal places after aggregation. The API returns
the base as `totals.penalty` and the monetary penalty as `totals.penaltyAmount`.
Shipped days come from the export and are not advanced while balances are stale.
The UI shows the inferred report date and import time separately.

Agents see their route's invoices, including older managers' invoices on that
route. Owners require agreement between current agents dictionary route and a
manager actually present in that export route. Multiple matching candidates fall
back to a dictionary-confirmed majority manager. Ambiguous routes remain available
only to admin/manager, and the unmatched count is shown. Supervisors see only
allowed departments. Brand managers and other tenants have no access. Query filters
are ANDed with role scope. Options and totals use the same scope. Responses are
no-store and the React query key includes the user identity and tenant.

The macro excludes other document types and partner-level adjustments. Preserve
any difference between the sale/return total and the 1C grand total in sync
metadata for diagnostics. Do not display this technical difference in the UI.
Customer data, network names and financial
results belong in the database and Drive, never in this public repository.

## Validation

`node --test` covers thresholds, networks, returns, invalid exports, route-owner
ambiguity, tenant restrictions and fail-closed user scope. The migration and full
source import were exercised on an isolated Neon branch. Row balances and network
flags were compared to every row of the supplied macro output. A forced insert
failure after DELETE verified transaction rollback.
