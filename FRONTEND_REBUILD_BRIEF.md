# Frontend Rebuild Brief (based on current backend)

Date: 2026-07-10
Backend: soda-beckend

## 1. What is already fixed in backend

- Base API URL (local): http://localhost:5000
- Swagger UI: /api-docs
- OpenAPI JSON: /api-docs.json
- App timezone default: Europe/Kyiv
- DB session timezone default: Europe/Kyiv
- JWT auth is used for protected endpoints

## 2. Current endpoint map for frontend

### Public/utility

- GET /

### Auth

- POST /api/auth/login
- POST /api/auth/change-password (requires Bearer token)

### Sales

- GET /api/sales (requires Bearer token)
- GET /api/sales/:salesId (requires Bearer token)

### Imports and files

- POST /api/upload (requires Bearer token; admin/manager)
- POST /api/prices/upload (requires Bearer token; admin/manager)
- GET /api/google-drive (requires Bearer token; admin/manager)
- GET /api/imports/run (requires Bearer token; admin only)
- POST /api/upload/photos (requires Bearer token)

## 3. Access matrix currently implied by backend

- admin: full access, including import run
- manager: can upload sales/prices and read google-drive files
- supervisor/agent/brand_manager: can work with sales data by role filters

## 4. Data and UX information needed from product side

Please confirm each item:

- [ ] Final list of frontend pages/screens
- [ ] Routing map (which URL path per screen)
- [ ] Role-based visibility per page and per action
- [ ] Required table columns for Sales list
- [ ] Default filters/sorting/pagination behavior
- [ ] Exact date format and timezone display rules in UI
- [ ] Upload UX details (single file, progress bar, retry, error messages)
- [ ] Photo upload UX (preview, replace, remove)
- [ ] Validation messages language and wording
- [ ] Empty states and error states for every page
- [ ] Mobile breakpoints and priority screens for adaptive layout
- [ ] Target browsers/devices support matrix
- [ ] Performance expectations (first load, table interactions)

## 5. API contract clarifications needed before frontend rewrite

- [ ] Confirm stable response schema for each endpoint (especially sales rows shape)
- [ ] Confirm expected HTTP error codes and error payload format
- [ ] Confirm token lifetime and refresh strategy (currently no refresh endpoint)
- [ ] Confirm max upload file size and accepted mime types by endpoint
- [ ] Confirm whether frontend should call /api/google-drive directly or only trigger /api/imports/run

## 6. Security and deployment prerequisites impacting frontend

- [ ] Secrets rotation completed (JWT, Cloudinary)
- [ ] CORS policy finalized for production frontend domain
- [ ] Production API base URL defined
- [ ] Automated tests baseline defined
- [ ] npm audit risk acceptance/mitigation approved

## 7. Frontend kickoff deliverables to prepare now

- [ ] Postman collection with environment variables
- [ ] Shared API types/interfaces generated from OpenAPI
- [ ] UI state map (loading/success/empty/error) per route
- [ ] Role-based navigation map

## 8. Suggested working flow

1. Freeze API contract from /api-docs.
2. Confirm role matrix and screen map.
3. Build auth shell and route guards.
4. Implement Sales list + filters + pagination.
5. Implement uploads and admin/manager flows.
6. Add photo upload UI to protected pages.
7. Final UAT with role-based scenarios.
