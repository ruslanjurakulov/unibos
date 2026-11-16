# P4.1 catalog and table controls

Status: implementation and disposable PostgreSQL integration tests are present. The web page at `/demo/operations` is a synthetic frontend demo and is not connected to an API.

## Database model

Migration `003-restaurant-catalog-tables.sql` adds organization-scoped product categories and products; append-only, branch-scoped price versions in integer minor units; branch product availability; branch-scoped restaurant tables; and revocable QR token records. Composite foreign keys bind products to their organization and bind prices, availability, tables, and QR tokens to the same organization/branch. Every new tenant table has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.

Owner/director manage product identity and prices. Assigned branch administrators manage availability, tables, and table QR credentials. Other branch roles can read permitted catalog/table data but cannot mutate it. Price versions have no UPDATE or DELETE grant. Products and categories are archived with `active=false`. Token hashes are 32-byte SHA-256 digests; the app role cannot SELECT the hash. Token secrets are returned only at creation. Renewal creates a new token; revoke is one-way.

## API surface

- `GET|POST /api/organizations/:org/catalog/categories`
- `PATCH /api/organizations/:org/catalog/categories/:category`
- `GET|POST /api/organizations/:org/catalog/products`
- `PATCH /api/organizations/:org/catalog/products/:product`
- `GET /api/organizations/:org/branches/:branch/catalog`
- `GET|POST /api/organizations/:org/branches/:branch/catalog/:product/price`
- `PATCH /api/organizations/:org/branches/:branch/catalog/:product/availability`
- `GET|POST /api/organizations/:org/branches/:branch/tables`
- `PATCH /api/organizations/:org/branches/:branch/tables/:table`
- `POST /api/organizations/:org/branches/:branch/tables/:table/qr-tokens`
- `PATCH /api/organizations/:org/table-qr-tokens/:token`

All requests use the established verified-session identity and tenant transaction. Sensitive mutations require recent MFA. The API does not accept a tenant or actor identity from the request body. Price history is append-only and client-supplied totals are not used here.

## Recovery and migration procedure

The migration runner takes an advisory lock, applies each migration and records its SHA-256 checksum in the same transaction. Running the same unchanged file is idempotent. A changed checksum fails closed. The disposable integration suite creates a fresh database, applies all business migrations twice, then drops only that test database. For production/staging adoption, take a tested database snapshot first, deploy the exact reviewed migration checksum, verify schema/RLS and application health, and use snapshot restore for recovery. Do not edit an applied migration or run a destructive down migration; use a reviewed forward migration for corrections.

The pre-existing local `unibos` volume has a different checksum already recorded for migration ID `unibos-business-003`; the strict runner refuses to overwrite that history. It was left intact. The new migration has been validated on the disposable integration database rather than against that persistent local history.

## Known limits

- Product image keys are validated pointers to `/images/products/...`; there is no upload or object-storage service yet. The demo supports an in-browser image preview only and uploads nothing.
- QR/NFC secret creation and revocation APIs exist, but public token resolution, rendered QR codes and NFC activation are not part of P4.1.
- Vercel hosts the website only; the API and PostgreSQL are not deployed there. The P4.1 page is clearly marked synthetic and does not imply persistence.
