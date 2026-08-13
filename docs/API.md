# ShopSense API Reference

Base URL: `http://localhost:5000/api`

All request/response bodies are JSON. Protected routes require an
`Authorization: Bearer <jwt>` header (see [Auth](#authentication)).

---

## Authentication

JWT-based. The `role` claim in the token selects the account collection:
`customer` → `Customer`, otherwise `Vendor` (whose `role` is `vendor` or
`admin`). Tokens expire after `JWT_EXPIRES_IN` (default `7d`).

### POST /auth/customer/register
Create a customer account.
```json
// body
{ "name": "Ada", "email": "ada@x.com", "password": "secret123" }
// 201
{ "customer": { "id": "...", "name": "...", "email": "..." }, "token": "..." }
```

### POST /auth/customer/login
```json
{ "email": "ada@x.com", "password": "secret123" }
```

### POST /auth/vendor/register · /auth/vendor/login
Vendor registration/login. Registration accepts business details
(`businessName`, `businessName`, `commissionRate` etc.).

### POST /auth/admin/register · /auth/admin/login
Admin registration/login. Admin registration is typically seeded once, then
disabled.

### GET /auth/me  🔒
Current account profile from the token.

---

## Vendors

### GET /vendors/me  🔒 vendor|admin
### PUT /vendors/me  🔒 vendor|admin  — update profile
### PUT /vendors/me/password  🔒 vendor|admin  — change password
### POST /vendors/me/verification  🔒 vendor|admin  — submit KYC docs
### GET /vendors  🔒 admin  — list all vendors
### GET /vendors/:id  🔒 admin
### PATCH /vendors/:id/status  🔒 admin  — `{ status: "Active"|"Suspended"|"Pending" }`

---

## Customers

### GET /customers  🔒 admin  — list/search customers
### GET /customers/segments  🔒 admin  — RFM segmentation
### GET /customers/:id/behaviour  🔒 admin  — purchase behaviour profile

---

## Products

### GET /products  — list/catalog (public, supports `?category=&vendor=&q=`)
### GET /products/:id  — product detail
### POST /products  🔒 vendor  — create product (auto-creates an Inventory row)
### PUT /products/:id  🔒 vendor|admin  — update (vendor can only edit own)
### DELETE /products/:id  🔒 vendor|admin  — soft delete

---

## Inventory

### GET /inventory  🔒 vendor|admin  — list own/all inventory
### GET /inventory/low-stock  `?threshold=N`  🔒 admin  — items at/below reorder threshold (or per-row `reorderThreshold` when omitted)
### GET /inventory/forecast  `?horizon=7`  🔒 admin  — demand forecast
### PATCH /inventory/:productId  🔒 vendor|admin  — restock `{ quantity }`

---

## Transactions

### POST /transactions  — create order (cart checkout uses this internally)
### GET /transactions  🔒 — list (scoped by role)

---

## Cart  🔒 customer

### GET /cart  — current cart
### POST /cart  `{ "productId": "...", "quantity": 2 }`  — add item (checks stock)
### PATCH /cart/:productId  `{ "quantity": 3 }`  — set quantity
### DELETE /cart/:productId  — remove item
### DELETE /cart  — clear
### POST /cart/checkout  — atomic all-or-nothing checkout → creates a Transaction

---

## Wishlist  🔒 customer

### GET /wishlist
### POST /wishlist/:productId
### DELETE /wishlist/:productId
### POST /wishlist/:productId/move-to-cart  — move one item to cart

---

## Categories

### GET /categories  🔒 — list
### POST /categories  🔒 admin  — `{ name }`

---

## Recommendations

### GET /recommendations  `?customerId=...&limit=5`  — personalised (SVD/cosine, with popular fallback)
### GET /recommendations/popular  `?limit=5`  — non-personalised popular items

---

## Analytics  🔒 admin (unless noted)

All analytics endpoints accept `from`/`to` (ISO datetimes) and `period`
(`day`|`month`) query params to scope the window and timeseries bucketing.

### GET /analytics/summary  🔒 vendor|admin  — KPI overview
### GET /analytics/revenue  🔒 vendor|admin  — revenue by vendor
### GET /analytics/products  🔒 vendor|admin  — product performance
### GET /analytics/chart  🔒 vendor|admin  — chart-ready series (validated)

### GET /analytics/revenue-analysis  — commission, margin, growth, timeseries
Returns `{ byVendor, totals, growth, timeseries }`.

### GET /analytics/revenue-analysis/export  — CSV download of the above

### GET /analytics/benchmark  — vendor composite scoring
Each vendor gets `revenueScore`, `fulfilmentScore`, `growthScore`, and a
weighted `compositeScore` = `0.5·revenue + 0.3·fulfilment + 0.2·growth`,
normalised to 0–100. Rows sorted desc by composite.

### GET /analytics/benchmark/export  — CSV of the ranking

### GET /analytics/report  `?format=pdf`  — generated PDF report (PDFKit)

### GET /analytics/validate  — backtests the M2 analytical models
Returns `{ forecastAccuracy, segmentationQuality, recommendationRelevance }`
(each in `[0,1]`) + `thresholds` (`0.80 / 0.85 / 0.75`) + `details`.

### GET /analytics/executive  — consolidated executive summary
Single call returning `{ summary, growth, totals, trend, topVendors,
topProducts, marketplace, benchmark, generatedAt, filters }` for the
executive BI dashboard.

---

## Errors

All errors follow a uniform envelope:
```json
{
  "error": {
    "message": "Insufficient permissions",
    "code": "FORBIDDEN"
  }
}
```
| Status | Meaning                                   |
|--------|-------------------------------------------|
| 400    | Validation / bad request                  |
| 401    | Missing/invalid token                     |
| 403    | Authenticated but insufficient role       |
| 404    | Resource not found                        |
| 409    | Conflict (e.g. duplicate, stock shortfall)|
| 500    | Server error                              |

Rate limited: 1000 requests / 15 min per IP.
