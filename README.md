# sales-viz-server

Elysia server built to support purchase visualization. It processes excel sheets of purchase data and stores it in DB for future visualization queries.

## Setup

1. **Install dependencies:**

   ```bash
   bun install
   ```

2. **Configure environment:**

   ```bash
   cp .env.example .env
   # Edit .env and set required variables
   ```

3. **Start server:**
   ```bash
   bun run dev
   ```

4. **Run tests:**
   ```bash
   bun test
   ```

See [TESTING.md](TESTING.md) for more details on testing.

## Configuration Validation

The server validates all required configuration on startup. If any required variables are missing or invalid, the server will **fail immediately** with a clear error message:

```bash
ConfigurationError: PORT is required but not set
```

This ensures you catch configuration issues immediately rather than at runtime.
