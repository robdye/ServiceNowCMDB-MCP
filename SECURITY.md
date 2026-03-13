# Security

## Reporting Vulnerabilities

Please do **not** report security vulnerabilities through public GitHub issues.
If you discover a vulnerability, follow the guidance at
[https://aka.ms/SECURITY.md](https://aka.ms/SECURITY.md).

---

## UI Widgets and Security

ServiceNowCMDB-MCP serves an interactive React widget inside Microsoft 365
Copilot Chat.  This section documents the security boundaries that protect
the widget, the MCP server, and the end-user's browser.

### Widget-renderer origin and CORS

When M365 Copilot renders a widget returned by an MCP tool, it loads the
HTML inside a **sandboxed iframe** hosted at a dedicated origin:

```
https://{sha256-of-server-domain}.widget-renderer.usercontent.microsoft.com
```

The hash is derived from the MCP server's public domain name (the value of
`WEBSITE_HOSTNAME` on Azure App Service).  Because the iframe origin differs
from the MCP server origin, every sub-resource request the widget makes
(JavaScript, CSS, API calls) is a **cross-origin request** and is blocked
by the browser unless the server explicitly allows it.

This server computes the expected widget-renderer origin at startup and
passes it — along with the server's own origin and localhost for local
development — to the Starlette CORS middleware.  Only those origins are
permitted; `Access-Control-Allow-Origin: *` is never used.

The `Content-Security-Policy` header on the HTML response further restricts
framing to `'self'` and `https://*.widget-renderer.usercontent.microsoft.com`,
preventing click-jacking from any other origin.

If you deploy to a custom domain or staging environment, set the
`WIDGET_RENDERER_ORIGIN` environment variable to the exact origin shown
in the browser console error.

### Authentication

This server supports two authentication modes for the ServiceNow REST API:

| Auth type | When to use |
|-----------|-------------|
| **OAuth 2.0 (client credentials or password grant)** | Production.  Set `SERVICENOW_CLIENT_ID` and `SERVICENOW_CLIENT_SECRET` as environment variables. |
| **Basic Auth** | Development / test instances.  Set `SERVICENOW_USERNAME` and `SERVICENOW_PASSWORD`. |

OAuth is attempted first; Basic Auth is used as a fallback.

For the MCP server itself (M365 Copilot ↔ MCP):

| Auth type | When to use |
|-----------|-------------|
| **None** | Local development and testing only. |
| **OAuth 2.1 (Authorization Code + PKCE)** | Production servers that call user-scoped APIs. |
| **Microsoft Entra SSO** | Production servers in Microsoft 365 tenants. |

> **Anonymous access (`"type": "None"`) must only be used during
> development.**  Before deploying to production, configure OAuth 2.1 or
> Entra SSO in the `mcp-plugin.json` manifest.

### Secrets and the browser boundary

The UI widget runs in an **untrusted browser context** (a sandboxed iframe
with a unique origin).  The following rules apply:

1. **Never embed API keys, tokens, or secrets in widget HTML or
   JavaScript.**  ServiceNow credentials exist only in the server process
   environment.  They are never serialised into tool responses,
   `structuredContent`, or the HTML resource.

2. **Widgets must call back into MCP tools for any data that requires
   authentication.**  The host SDK exposes `window.openai.callTool()`
   so the widget can invoke server-side tools without possessing credentials.

3. **Tool responses should contain only the data the widget needs to
   render.**  The `structuredContent` returned by `show_ci_explorer`
   includes CI records — not API keys, session tokens, or internal
   identifiers.

4. **Static assets served to the widget (JS, CSS) must not contain
   secrets.**  The Vite build output in `ui/ci-explorer/dist/` is
   public code.
