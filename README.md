# ServiceNowCMDB-MCP

A Model Context Protocol (MCP) server that exposes ServiceNow CMDB Configuration Item operations as tools for AI assistants.  Built with Python FastMCP, it includes an interactive MCP App UI with dependency graph visualisation.

## Features

### MCP Tools
- **search_configuration_items** — Search CIs by name, owner, manager, support group, class, category, IP, or FQDN
- **list_configuration_items** — List CIs with pagination and sorting
- **get_configuration_item** — Get full CI details by sys_id
- **create_configuration_item** — Create a new CI in the CMDB
- **update_configuration_item** — Update an existing CI
- **delete_configuration_item** — Delete a CI from the CMDB
- **get_ci_dependencies** — Get upstream/downstream dependency graph (1–3 levels deep)
- **show_ci_explorer** — Interactive CI explorer with dependency graph (MCP App widget)

### MCP App UI
- **CI Table** — Searchable, sortable list of Configuration Items
- **Detail Panel** — Full CI details with all fields
- **Dependency Graph** — SVG network visualisation of upstream/downstream CIs
- **Search** — Filter by name, owner, manager, support group, class, category, IP, FQDN
- **Fluent UI 2** — Native M365 look and feel with dark/light theme support

## Prerequisites

- Python 3.13+
- Node.js 20+ (for UI build)
- ServiceNow instance with REST API access
- Azure subscription (for deployment)

## Setup

### 1. Environment Variables
```bash
export SERVICENOW_INSTANCE=https://your-instance.service-now.com
export SERVICENOW_CLIENT_ID=your_oauth2_client_id
export SERVICENOW_CLIENT_SECRET=your_oauth2_client_secret
# Optional: for resource owner password grant
export SERVICENOW_USERNAME=your_username
export SERVICENOW_PASSWORD=your_password
```

### 2. Install Dependencies
```bash
python -m venv .venv
.venv/Scripts/Activate.ps1  # Windows
pip install -r requirements.txt
```

### 3. Build the UI
```bash
cd ui/ci-explorer
npm install
npm run build
cd ../..
```

### 4. Run Locally
```bash
python server.py
```
Server starts at `http://localhost:8000`.  CI Explorer UI at `http://localhost:8000/ui`.

## Deploy to Azure

```powershell
.\Deploy-ServiceNowCMDB-MCP.ps1 `
    -ServiceNowInstance "https://dev12345.service-now.com" `
    -ServiceNowClientId "your_client_id" `
    -ServiceNowClientSecret "your_client_secret"
```

## Architecture

```
ServiceNowCMDB-MCP/
├── server.py                  # MCP server — all tools + ServiceNow API client
├── requirements.txt           # Python dependencies
├── Dockerfile                 # Multi-stage Docker build
├── Deploy-ServiceNowCMDB-MCP.ps1  # Azure deployment script
└── ui/ci-explorer/            # React MCP App widget
    ├── src/
    │   ├── App.tsx            # Main app — search, KPIs, table, detail panel
    │   ├── types.ts           # TypeScript types
    │   ├── hostBridge.ts      # MCP Apps SDK bridge
    │   └── components/
    │       ├── SearchBar.tsx          # Search input + field selector
    │       ├── CITable.tsx            # CI results table
    │       ├── CIDetailPanel.tsx      # Detail panel with tabs
    │       ├── DependencyGraphView.tsx # SVG dependency network graph
    │       └── SkeletonRow.tsx        # Loading placeholder
    └── dist/index.html        # Built single-file widget
```

## ServiceNow API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/now/table/cmdb_ci` | GET | List/search CIs |
| `/api/now/table/cmdb_ci/{sys_id}` | GET | Get single CI |
| `/api/now/table/cmdb_ci` | POST | Create CI |
| `/api/now/table/cmdb_ci/{sys_id}` | PATCH | Update CI |
| `/api/now/table/cmdb_ci/{sys_id}` | DELETE | Delete CI |
| `/api/now/table/cmdb_rel_ci` | GET | Query CI relationships |
