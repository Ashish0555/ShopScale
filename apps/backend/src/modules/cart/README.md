# Cart Module

Implemented in Step 4:

- authenticated cart retrieval
- add item
- update quantity
- remove item
- clear cart
- product existence validation
- active-product validation
- quantity validation
- stock checks against inventory availability

Cart mutations always derive the user ID from auth middleware, never from request body or query parameters.
