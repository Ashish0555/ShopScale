# Products Module

Implemented in Step 3:

- category CRUD
- product CRUD
- admin-only create/update/delete
- public read access
- pagination
- active/category filtering
- search across product names, descriptions, and SKUs
- sorting by creation date, name, or price
- Zod input validation
- database uniqueness and query indexes

Product prices are stored as integer cents. Inventory quantities are intentionally handled by the inventory/cart/order phases rather than embedded directly in product rows.
