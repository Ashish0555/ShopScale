# Auth Module

Implemented in Step 2:

- customer registration
- email/password login
- scrypt password hashing
- short-lived JWT access tokens
- opaque refresh token rotation
- logout refresh-token revocation
- authentication middleware
- role-based authorization helpers

Access tokens identify the request, but protected routes reload the user from storage so user ID and role are never trusted from frontend input alone.
