# Aircon Service Management (Demo) Backend

ASP.NET Core Controller API for the Aircon Service Management (Demo) application.

## Requirements

- .NET SDK 10

## Project structure

```text
backend/
├── Features/                         Feature modules and their API contracts
│   ├── Health/                       Health endpoint
│   └── Customers/, Jobs via Customers/, Invoices/, Quotes/, Expenses/, Teams/, Auth/, Documents/, ActivityLogs/
├── Options/                          Strongly typed application settings
├── Properties/                       Local launch profiles
├── tests/
│   └── ShengHengAircon.Api.Tests/    API integration tests
├── Program.cs                        Service registration and HTTP pipeline
├── ShengHengAircon.Api.csproj        API project
└── ShengHengAircon.slnx              Backend solution
```

New business areas should follow the `Features/<FeatureName>` pattern. For
example, customer endpoints and their request/response models should live under
`Features/Customers`.

## Run locally

From the repository root:

```powershell
dotnet run --project .\backend\ShengHengAircon.Api.csproj
```

The development launch profile serves the API at `http://localhost:5187`.

Available development endpoints:

- `GET /api/health` checks whether the API is running.
- `GET /api/customers` lists customers.
- `GET /api/customers/{id}` returns one customer.
- `POST /api/customers` creates a customer.
- `PUT /api/customers/{id}` updates a customer.
- `DELETE /api/customers/{id}` deletes a customer.
- `GET /openapi/v1.json` returns the OpenAPI document.

The OpenAPI endpoint is disabled outside the Development environment.

## Run tests

From the repository root:

```powershell
dotnet test --solution .\backend\ShengHengAircon.slnx --configuration Release
```

The repository `global.json` selects Microsoft Testing Platform for .NET 10.

## Frontend access

Development CORS configuration allows requests from the Vite development
server at `http://localhost:5173`. Production origins must be configured before
deployment.

## Supabase configuration

Supabase integration is implemented and disabled by default in the checked-in configuration. Repository implementations use injected HttpClient instances to call the Supabase REST API for PostgreSQL records and RPC operations. File storage uses Supabase Storage HTTP endpoints. The backend does not use Entity Framework Core.

To run against your own isolated demo project, enable integration and inject its settings through server-side environment variables or .NET User Secrets:

```text
Supabase__Enabled=true
Supabase__Url=https://your-project.supabase.co
Supabase__ServiceRoleKey=<server-side-secret>
```

Never place the real service role key in `appsettings.json`, source control, or
frontend code. The application validates the URL and service role key during
startup whenever Supabase is enabled.

## Error responses

Unhandled exceptions and empty HTTP error responses use the standard
`application/problem+json` format. Each error includes a `traceId` for matching
the client response to server logs.
