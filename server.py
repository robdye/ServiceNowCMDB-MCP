"""
ServiceNowCMDB-MCP — ServiceNow CMDB Configuration Items MCP Server

A Model Context Protocol (MCP) server built with Python FastMCP that exposes
ServiceNow CMDB Configuration Item (CI) operations as tools.  Supports full
CRUD on the cmdb_ci table plus relationship/dependency graph traversal.

Authentication uses Basic Auth with credentials read from environment
variables so they are never exposed to callers or hard-coded in source.
"""

import asyncio
import hashlib
import json
import os
import re
from urllib.parse import quote as url_quote

import aiofiles
import httpx
from mcp.server.fastmcp import FastMCP
from mcp.types import CallToolResult, TextContent

# ---------------------------------------------------------------------------
#  Configuration
# ---------------------------------------------------------------------------

AZURE_HOST = os.environ.get(
    "WEBSITE_HOSTNAME", "servicenow-cmdb-mcp.azurewebsites.net"
)

mcp = FastMCP(
    "ServiceNowCMDB-MCP",
    instructions=(
        "ServiceNow CMDB server.  Provides tools to search, view, create, "
        "update, and delete Configuration Items, and to explore upstream / "
        "downstream dependency relationships."
    ),
    host="0.0.0.0",
    port=int(os.environ.get("PORT", "8000")),
    stateless_http=True,
    transport_security={"enable_dns_rebinding_protection": False},
)

# ---------------------------------------------------------------------------
#  ServiceNow HTTP helpers
# ---------------------------------------------------------------------------

_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    """Return a shared HTTP client with connection pooling and timeouts."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
        )
    return _http_client


def _sn_instance() -> str:
    """Return the ServiceNow instance base URL."""
    instance = os.environ.get("SERVICENOW_INSTANCE", "").rstrip("/")
    if not instance:
        raise RuntimeError(
            "SERVICENOW_INSTANCE environment variable is not set.  "
            "Set it to your instance URL, e.g. https://dev12345.service-now.com"
        )
    return instance


# ---------------------------------------------------------------------------
#  Authentication — OAuth2 with Basic Auth fallback
# ---------------------------------------------------------------------------

_oauth_token: str | None = None
_oauth_expiry: float = 0


def _has_basic_auth() -> bool:
    """Return True if Basic Auth credentials are available."""
    return bool(os.environ.get("SERVICENOW_USERNAME")) and bool(
        os.environ.get("SERVICENOW_PASSWORD")
    )


def _has_oauth() -> bool:
    """Return True if OAuth2 client credentials are available."""
    return bool(os.environ.get("SERVICENOW_CLIENT_ID")) and bool(
        os.environ.get("SERVICENOW_CLIENT_SECRET")
    )


async def _get_oauth_token() -> str:
    """Obtain or reuse an OAuth2 access token."""
    global _oauth_token, _oauth_expiry
    import time

    if _oauth_token and time.time() < _oauth_expiry - 60:
        return _oauth_token

    client_id = os.environ.get("SERVICENOW_CLIENT_ID", "")
    client_secret = os.environ.get("SERVICENOW_CLIENT_SECRET", "")

    username = os.environ.get("SERVICENOW_USERNAME", "")
    password = os.environ.get("SERVICENOW_PASSWORD", "")

    token_url = f"{_sn_instance()}/oauth_token.do"
    client = _get_http_client()

    token_data: dict[str, str] = {
        "grant_type": "password" if username else "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }
    if username:
        token_data["username"] = username
        token_data["password"] = password

    resp = await client.post(
        token_url,
        data=token_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    token_resp = resp.json()

    _oauth_token = token_resp["access_token"]
    _oauth_expiry = time.time() + int(token_resp.get("expires_in", 1800))

    return _oauth_token


async def _sn_auth_headers() -> dict[str, str]:
    """Return authorization headers — tries OAuth2 first, falls back to Basic."""
    import base64

    # Try OAuth2 if configured
    if _has_oauth():
        try:
            token = await _get_oauth_token()
            return {
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
            }
        except Exception:
            # OAuth failed — fall through to Basic Auth if available
            if not _has_basic_auth():
                raise

    # Basic Auth fallback
    if _has_basic_auth():
        user = os.environ["SERVICENOW_USERNAME"]
        pwd = os.environ["SERVICENOW_PASSWORD"]
        creds = base64.b64encode(f"{user}:{pwd}".encode()).decode()
        return {
            "Accept": "application/json",
            "Authorization": f"Basic {creds}",
        }

    raise RuntimeError(
        "No ServiceNow credentials configured. Set either "
        "SERVICENOW_USERNAME + SERVICENOW_PASSWORD (Basic Auth) or "
        "SERVICENOW_CLIENT_ID + SERVICENOW_CLIENT_SECRET (OAuth2)."
    )


async def _sn_get(path: str, params: dict[str, str] | None = None) -> dict:
    """GET from the ServiceNow REST API and return the parsed JSON."""
    client = _get_http_client()
    headers = await _sn_auth_headers()
    resp = await client.get(
        f"{_sn_instance()}/api/now/{path}",
        params=params,
        headers=headers,
    )
    resp.raise_for_status()
    return resp.json()


async def _sn_post(path: str, body: dict) -> dict:
    """POST to the ServiceNow REST API."""
    client = _get_http_client()
    headers = await _sn_auth_headers()
    headers["Content-Type"] = "application/json"
    resp = await client.post(
        f"{_sn_instance()}/api/now/{path}",
        json=body,
        headers=headers,
    )
    resp.raise_for_status()
    return resp.json()


async def _sn_patch(path: str, body: dict) -> dict:
    """PATCH (update) a ServiceNow record."""
    client = _get_http_client()
    headers = await _sn_auth_headers()
    headers["Content-Type"] = "application/json"
    resp = await client.patch(
        f"{_sn_instance()}/api/now/{path}",
        json=body,
        headers=headers,
    )
    resp.raise_for_status()
    return resp.json()


async def _sn_delete(path: str) -> int:
    """DELETE a ServiceNow record.  Returns the HTTP status code."""
    client = _get_http_client()
    headers = await _sn_auth_headers()
    resp = await client.delete(
        f"{_sn_instance()}/api/now/{path}",
        headers=headers,
    )
    resp.raise_for_status()
    return resp.status_code


# ---------------------------------------------------------------------------
#  Input validation
# ---------------------------------------------------------------------------

_SYS_ID_RE = re.compile(r"^[a-f0-9]{32}$")


def _validate_sys_id(sys_id: str) -> str:
    """Validate a ServiceNow sys_id (32-char hex)."""
    sys_id = sys_id.strip().lower()
    if not _SYS_ID_RE.match(sys_id):
        raise ValueError(f"Invalid sys_id: {sys_id!r}  (expected 32 hex chars)")
    return sys_id


# Standard CI fields to return (limits payload size)
_CI_FIELDS = (
    "sys_id,name,sys_class_name,category,subcategory,"
    "operational_status,install_status,environment,"
    "assigned_to,owned_by,managed_by,support_group,"
    "ip_address,fqdn,os,os_version,manufacturer,model_id,"
    "serial_number,asset_tag,location,department,company,"
    "short_description,comments,sys_updated_on,sys_created_on"
)


def _format_ci(ci: dict) -> dict:
    """Flatten display_value / value pairs into simple values."""
    out: dict = {}
    for key, val in ci.items():
        if isinstance(val, dict):
            out[key] = val.get("display_value") or val.get("value", "")
        else:
            out[key] = val
    return out


# ---------------------------------------------------------------------------
#  MCP Tools — Search / Read
# ---------------------------------------------------------------------------


@mcp.tool()
async def search_configuration_items(
    query: str,
    field: str = "name",
    limit: int = 25,
    offset: int = 0,
) -> str:
    """Search for Configuration Items in the ServiceNow CMDB.

    Args:
        query:  Search term (partial match supported).
        field:  Field to search.  One of: name, owned_by, managed_by,
                support_group, sys_class_name, category, ip_address, fqdn.
                Defaults to "name".
        limit:  Max results to return (1–100). Defaults to 25.
        offset: Pagination offset. Defaults to 0.
    """
    allowed_fields = {
        "name", "owned_by", "managed_by", "support_group",
        "sys_class_name", "category", "ip_address", "fqdn",
    }
    if field not in allowed_fields:
        return json.dumps({"error": f"Invalid field '{field}'. Allowed: {sorted(allowed_fields)}"})

    limit = max(1, min(100, limit))
    safe_query = query.replace("'", "\\'")

    params: dict[str, str] = {
        "sysparm_query": f"{field}LIKE{safe_query}^ORDERBYname",
        "sysparm_fields": _CI_FIELDS,
        "sysparm_limit": str(limit),
        "sysparm_offset": str(offset),
        "sysparm_display_value": "true",
    }
    data = await _sn_get("table/cmdb_ci", params)
    results = [_format_ci(r) for r in data.get("result", [])]
    return json.dumps({"count": len(results), "results": results}, indent=2)


@mcp.tool()
async def get_configuration_item(sys_id: str) -> str:
    """Get full details of a single Configuration Item by sys_id.

    Args:
        sys_id: The 32-character sys_id of the CI.
    """
    sys_id = _validate_sys_id(sys_id)
    params = {
        "sysparm_fields": _CI_FIELDS,
        "sysparm_display_value": "true",
    }
    data = await _sn_get(f"table/cmdb_ci/{sys_id}", params)
    return json.dumps(_format_ci(data.get("result", {})), indent=2)


@mcp.tool()
async def list_configuration_items(
    limit: int = 25,
    offset: int = 0,
    order_by: str = "name",
) -> str:
    """List Configuration Items from the CMDB with pagination.

    Args:
        limit:    Max results (1–100). Defaults to 25.
        offset:   Pagination offset. Defaults to 0.
        order_by: Field to sort by. Defaults to "name".
    """
    limit = max(1, min(100, limit))
    params: dict[str, str] = {
        "sysparm_query": f"ORDERBYname" if order_by == "name" else f"ORDERBY{order_by}",
        "sysparm_fields": _CI_FIELDS,
        "sysparm_limit": str(limit),
        "sysparm_offset": str(offset),
        "sysparm_display_value": "true",
    }
    data = await _sn_get("table/cmdb_ci", params)
    results = [_format_ci(r) for r in data.get("result", [])]
    return json.dumps({"count": len(results), "results": results}, indent=2)


# ---------------------------------------------------------------------------
#  MCP Tools — Create / Update / Delete
# ---------------------------------------------------------------------------


@mcp.tool()
async def create_configuration_item(
    name: str,
    sys_class_name: str = "cmdb_ci",
    category: str = "",
    subcategory: str = "",
    environment: str = "",
    operational_status: str = "1",
    assigned_to: str = "",
    owned_by: str = "",
    managed_by: str = "",
    support_group: str = "",
    ip_address: str = "",
    fqdn: str = "",
    short_description: str = "",
    comments: str = "",
) -> str:
    """Create a new Configuration Item in the CMDB.

    Args:
        name:               CI name (required).
        sys_class_name:     CI class (e.g. cmdb_ci_server, cmdb_ci_appl). Default: cmdb_ci.
        category:           Category (e.g. Hardware, Software).
        subcategory:        Subcategory.
        environment:        Environment (e.g. Production, Development, Test).
        operational_status: 1=Operational, 2=Non-Operational, 3=Repair, 6=Retired.
        assigned_to:        User name or sys_id of assigned user.
        owned_by:           User name or sys_id of owner.
        managed_by:         User name or sys_id of manager.
        support_group:      Support group name or sys_id.
        ip_address:         IP address.
        fqdn:               Fully qualified domain name.
        short_description:  Short description of the CI.
        comments:           Additional comments.
    """
    if not name.strip():
        return json.dumps({"error": "CI name is required"})

    body: dict[str, str] = {"name": name.strip()}
    for field_name, value in [
        ("sys_class_name", sys_class_name),
        ("category", category),
        ("subcategory", subcategory),
        ("environment", environment),
        ("operational_status", operational_status),
        ("assigned_to", assigned_to),
        ("owned_by", owned_by),
        ("managed_by", managed_by),
        ("support_group", support_group),
        ("ip_address", ip_address),
        ("fqdn", fqdn),
        ("short_description", short_description),
        ("comments", comments),
    ]:
        if value.strip():
            body[field_name] = value.strip()

    data = await _sn_post("table/cmdb_ci", body)
    return json.dumps(_format_ci(data.get("result", {})), indent=2)


@mcp.tool()
async def update_configuration_item(
    sys_id: str,
    name: str = "",
    category: str = "",
    subcategory: str = "",
    environment: str = "",
    operational_status: str = "",
    assigned_to: str = "",
    owned_by: str = "",
    managed_by: str = "",
    support_group: str = "",
    ip_address: str = "",
    fqdn: str = "",
    short_description: str = "",
    comments: str = "",
) -> str:
    """Update an existing Configuration Item.  Only non-empty fields are updated.

    Args:
        sys_id:             The sys_id of the CI to update (required).
        name:               New name.
        category:           New category.
        subcategory:        New subcategory.
        environment:        New environment.
        operational_status: New status (1=Operational, 2=Non-Op, 3=Repair, 6=Retired).
        assigned_to:        New assigned user.
        owned_by:           New owner.
        managed_by:         New manager.
        support_group:      New support group.
        ip_address:         New IP address.
        fqdn:               New FQDN.
        short_description:  New description.
        comments:           New comments.
    """
    sys_id = _validate_sys_id(sys_id)
    body: dict[str, str] = {}
    for field_name, value in [
        ("name", name),
        ("category", category),
        ("subcategory", subcategory),
        ("environment", environment),
        ("operational_status", operational_status),
        ("assigned_to", assigned_to),
        ("owned_by", owned_by),
        ("managed_by", managed_by),
        ("support_group", support_group),
        ("ip_address", ip_address),
        ("fqdn", fqdn),
        ("short_description", short_description),
        ("comments", comments),
    ]:
        if value.strip():
            body[field_name] = value.strip()

    if not body:
        return json.dumps({"error": "No fields provided to update"})

    data = await _sn_patch(f"table/cmdb_ci/{sys_id}", body)
    return json.dumps(_format_ci(data.get("result", {})), indent=2)


@mcp.tool()
async def delete_configuration_item(sys_id: str) -> str:
    """Delete a Configuration Item from the CMDB.

    Args:
        sys_id: The sys_id of the CI to delete.
    """
    sys_id = _validate_sys_id(sys_id)
    status = await _sn_delete(f"table/cmdb_ci/{sys_id}")
    return json.dumps({"deleted": True, "sys_id": sys_id, "status_code": status})


# ---------------------------------------------------------------------------
#  MCP Tools — Dependency / Relationship Graph
# ---------------------------------------------------------------------------


async def _fetch_relationships(sys_id: str, direction: str) -> list[dict]:
    """Fetch CI relationships from cmdb_rel_ci table.

    direction: 'upstream' (things this CI depends on) or
               'downstream' (things that depend on this CI).
    """
    if direction == "upstream":
        query = f"child={sys_id}"
    else:
        query = f"parent={sys_id}"

    params: dict[str, str] = {
        "sysparm_query": query,
        "sysparm_fields": "sys_id,parent,child,type",
        "sysparm_display_value": "true",
        "sysparm_limit": "200",
    }
    data = await _sn_get("table/cmdb_rel_ci", params)
    return [_format_ci(r) for r in data.get("result", [])]


@mcp.tool()
async def get_ci_dependencies(sys_id: str, depth: int = 1) -> str:
    """Get upstream and downstream dependency relationships for a CI.

    Returns a graph structure showing what this CI depends on (upstream)
    and what depends on this CI (downstream).

    Args:
        sys_id: The sys_id of the CI.
        depth:  How many levels deep to traverse (1-3). Defaults to 1.
    """
    sys_id = _validate_sys_id(sys_id)
    depth = max(1, min(3, depth))

    # Fetch the root CI details
    ci_params = {
        "sysparm_fields": "sys_id,name,sys_class_name,operational_status",
        "sysparm_display_value": "true",
    }
    root_data = await _sn_get(f"table/cmdb_ci/{sys_id}", ci_params)
    root_ci = _format_ci(root_data.get("result", {}))

    # BFS to gather upstream and downstream nodes
    async def _traverse(start_id: str, direction: str, max_depth: int) -> dict:
        nodes: dict[str, dict] = {}
        edges: list[dict] = []
        queue: list[tuple[str, int]] = [(start_id, 0)]
        visited: set[str] = {start_id}

        while queue:
            current_id, current_depth = queue.pop(0)
            if current_depth >= max_depth:
                continue

            rels = await _fetch_relationships(current_id, direction)
            for rel in rels:
                rel_type = rel.get("type", "")
                if direction == "upstream":
                    related_id_raw = rel.get("parent", "")
                    edge = {"from": current_id, "to": related_id_raw, "type": rel_type}
                else:
                    related_id_raw = rel.get("child", "")
                    edge = {"from": related_id_raw, "to": current_id, "type": rel_type}

                # related_id_raw might be display value; extract sys_id
                related_id = related_id_raw
                if isinstance(related_id, dict):
                    related_id = related_id.get("value", "")

                if not related_id:
                    continue

                edges.append(edge)

                if related_id not in visited:
                    visited.add(related_id)
                    # Fetch the related CI's details
                    try:
                        ci_data = await _sn_get(
                            f"table/cmdb_ci/{related_id}", ci_params
                        )
                        ci = _format_ci(ci_data.get("result", {}))
                        nodes[related_id] = ci
                    except Exception:
                        nodes[related_id] = {
                            "sys_id": related_id,
                            "name": related_id_raw if isinstance(related_id_raw, str) else str(related_id_raw),
                        }
                    queue.append((related_id, current_depth + 1))

        return {"nodes": nodes, "edges": edges}

    upstream, downstream = await asyncio.gather(
        _traverse(sys_id, "upstream", depth),
        _traverse(sys_id, "downstream", depth),
    )

    graph = {
        "root": root_ci,
        "upstream": upstream,
        "downstream": downstream,
    }
    return json.dumps(graph, indent=2)


# ---------------------------------------------------------------------------
#  MCP Apps — UI Resource
# ---------------------------------------------------------------------------

CMDB_RESOURCE_URI = "ui://servicenow-cmdb/ci-explorer"

_UI_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui")
_EXPLORER_DIST = os.path.join(_UI_DIR, "ci-explorer", "dist")


async def _read_explorer_html() -> str:
    """Read the built CI Explorer HTML asynchronously."""
    html_path = os.path.join(_EXPLORER_DIST, "index.html")
    async with aiofiles.open(html_path, "r", encoding="utf-8") as f:
        return await f.read()


@mcp.resource(
    CMDB_RESOURCE_URI,
    name="ci_explorer_ui",
    title="CI Explorer",
    description="Interactive CMDB Configuration Item explorer with dependency graph for M365 Copilot Chat",
    mime_type="text/html",
)
async def ci_explorer_ui() -> str:
    """Serve the React-built CI Explorer HTML widget."""
    return await _read_explorer_html()


# ---------------------------------------------------------------------------
#  MCP Apps — Show CI Dashboard Tool
# ---------------------------------------------------------------------------


def _build_ci_text_summary(items: list[dict], query_info: str) -> str:
    """Build a Markdown summary of CI search results."""
    n = len(items)
    lines: list[str] = []

    lines.append("## CMDB Configuration Items")
    lines.append(f"**{n} item{'s' if n != 1 else ''}** · {query_info}\n")

    if n == 0:
        lines.append("_No matching configuration items found._")
        return "\n".join(lines)

    lines.append("| Name | Class | Status | Owner | Support Group | Environment |")
    lines.append("|------|-------|--------|-------|---------------|-------------|")
    for ci in items:
        lines.append(
            f"| {ci.get('name', '—')} "
            f"| {ci.get('sys_class_name', '—')} "
            f"| {ci.get('operational_status', '—')} "
            f"| {ci.get('owned_by', '—')} "
            f"| {ci.get('support_group', '—')} "
            f"| {ci.get('environment', '—')} |"
        )

    return "\n".join(lines)


@mcp.tool(
    meta={
        "ui": {
            "resourceUri": CMDB_RESOURCE_URI,
            "description": "Renders an interactive CI explorer with dependency graph",
        }
    },
)
async def show_ci_explorer(
    query: str = "",
    field: str = "name",
    limit: int = 25,
) -> CallToolResult:
    """Show the CI Explorer dashboard for Configuration Items.

    Searches the CMDB and displays results with an interactive dependency
    graph.  The response includes:
      * A human-readable Markdown summary (works in any MCP client).
      * structuredContent for the CI Explorer widget in MCP Apps hosts.

    Args:
        query:  Search term.  Leave empty to list all CIs.
        field:  Field to search: name, owned_by, managed_by, support_group.
        limit:  Max results (1-50). Defaults to 25.
    """
    limit = max(1, min(50, limit))

    if query.strip():
        raw_result = await search_configuration_items(query, field, limit, 0)
    else:
        raw_result = await list_configuration_items(limit, 0)

    parsed = json.loads(raw_result)
    items = parsed.get("results", [])

    query_info = f'Search: "{query}" in {field}' if query else "All CIs"
    text_summary = _build_ci_text_summary(items, query_info)

    return CallToolResult(
        content=[TextContent(type="text", text=text_summary)],
        structuredContent={
            "items": items,
            "query": query,
            "field": field,
        },
    )


# ---------------------------------------------------------------------------
#  CORS origin computation (same pattern as AlphaAnalyzerMCP)
# ---------------------------------------------------------------------------


def _compute_widget_renderer_origin(server_domain: str) -> str:
    domain_hash = hashlib.sha256(server_domain.encode()).hexdigest()
    return f"https://{domain_hash}.widget-renderer.usercontent.microsoft.com"


def _build_allowed_origins() -> list[str]:
    origins: list[str] = []
    explicit = os.environ.get("WIDGET_RENDERER_ORIGIN", "").strip()
    if explicit:
        origins.append(explicit)
    origins.append(_compute_widget_renderer_origin(AZURE_HOST))
    origins.append(f"https://{AZURE_HOST}")
    origins.append("http://localhost:5173")
    origins.append("http://localhost:8000")
    return origins


# ---------------------------------------------------------------------------
#  Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    from starlette.middleware.cors import CORSMiddleware
    from starlette.responses import HTMLResponse, JSONResponse
    from starlette.routing import Route
    from starlette.types import ASGIApp, Receive, Scope, Send

    async def health(request):
        return JSONResponse({"status": "healthy", "server": "ServiceNowCMDB-MCP"})

    async def serve_explorer_ui(request):
        html = await _read_explorer_html()
        return HTMLResponse(
            content=html,
            headers={
                "Content-Type": "text/html; charset=utf-8",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": (
                    "frame-ancestors 'self' "
                    "https://*.widget-renderer.usercontent.microsoft.com"
                ),
                "Cache-Control": "no-cache",
            },
        )

    app = mcp.streamable_http_app()
    app.routes.insert(0, Route("/health", health))
    app.routes.insert(1, Route("/ui", serve_explorer_ui))

    class MCPCompatMiddleware:
        """Workaround for Azure App Service clients that omit text/event-stream
        from the Accept header.  This middleware injects it when missing and
        converts any SSE response back to plain JSON.

        NOTE: With stateless_http=True and streamable HTTP transport this
        middleware should rarely activate.  It exists as a safety net for
        older Copilot Studio integrations.  Once all consumers use the
        declarative-agent manifest (mcp-plugin.json), this middleware can
        be removed.
        """

        def __init__(self, app: ASGIApp) -> None:
            self.app = app

        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            if scope["type"] != "http":
                await self.app(scope, receive, send)
                return

            # Inject text/event-stream into Accept if missing
            raw_headers = list(scope.get("headers", []))
            original_accept = b""
            for k, v in raw_headers:
                if k == b"accept":
                    original_accept = v
                    break

            needs_fix = b"text/event-stream" not in original_accept
            if needs_fix:
                new_headers = [(k, v) for k, v in raw_headers if k != b"accept"]
                new_accept = original_accept.decode() + ", text/event-stream" if original_accept else "application/json, text/event-stream"
                new_headers.append((b"accept", new_accept.encode()))
                scope = dict(scope)
                scope["headers"] = new_headers

                # Collect and convert SSE response to JSON
                resp_status = 200
                resp_headers: list[tuple[bytes, bytes]] = []
                body_parts: list[bytes] = []

                async def capture_send(message: dict) -> None:
                    nonlocal resp_status
                    if message["type"] == "http.response.start":
                        resp_status = message.get("status", 200)
                        resp_headers.extend(message.get("headers", []))
                    elif message["type"] == "http.response.body":
                        body_parts.append(message.get("body", b""))
                        if not message.get("more_body", False):
                            full = b"".join(body_parts).decode("utf-8")
                            if "event:" in full and "data:" in full:
                                for line in full.split("\n"):
                                    if line.startswith("data: "):
                                        full = line[6:]
                                        break
                            out_headers = [
                                (k, v) for k, v in resp_headers
                                if k.lower() not in (b"content-type", b"content-length")
                            ]
                            encoded = full.encode("utf-8")
                            out_headers.append((b"content-type", b"application/json"))
                            out_headers.append((b"content-length", str(len(encoded)).encode()))
                            await send({"type": "http.response.start", "status": resp_status, "headers": out_headers})
                            await send({"type": "http.response.body", "body": encoded, "more_body": False})

                await self.app(scope, receive, capture_send)
            else:
                await self.app(scope, receive, send)

    app.add_middleware(MCPCompatMiddleware)

    # --- Allowed origins (computed once at startup) ---
    _allowed_origins = _build_allowed_origins()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=[
            "Content-Type",
            "Accept",
            "mcp-session-id",
        ],
        expose_headers=["mcp-session-id"],
        max_age=600,
    )

    port = int(os.environ.get("PORT", "8000"))
    print(f"CORS allowed origins: {_allowed_origins}")
    print(f"MCP endpoint: http://0.0.0.0:{port}/mcp")
    print(f"CI Explorer UI: http://0.0.0.0:{port}/ui")

    uvicorn.run(app, host="0.0.0.0", port=port)
