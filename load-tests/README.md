# Load Tests

Run the scenarios against a running backend with:

```bash
k6 run -e BASE_URL=http://localhost:4000 -e TEST_EMAIL=buyer@example.com shopscale.js
```

The script measures the built-in k6 HTTP timing metrics for:

- Product reads
- Registration/authentication
- Authenticated order creation

Do not record benchmark numbers in this repository unless they came from an actual run.
