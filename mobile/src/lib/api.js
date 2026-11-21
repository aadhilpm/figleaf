// Thin client for the Frappe / ERPNext REST API.
// On Android, fetch is routed through native HTTP (CapacitorHttp), so CORS does not apply.

let session = { server: "", token: "" };

export function setSession(next) {
  session = { ...session, ...next };
}

export function getSession() {
  return session;
}

export class ApiError extends Error {
  constructor(message, status = 0, type = "") {
    super(message);
    this.status = status;
    this.type = type;
  }
  get isAuth() {
    return this.status === 401 || this.type === "AuthenticationError" || this.type === "SessionExpired";
  }
  get isNetwork() {
    return this.status === 0;
  }
}

/** "figleaf.example.com" -> "https://figleaf.example.com" */
export function normalizeServer(input) {
  let s = String(input || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    const path = u.pathname.replace(/\/+$/, "");
    return u.origin + (path === "" ? "" : path);
  } catch {
    return "";
  }
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function extractMessage(data) {
  if (!data) return "";
  if (data._server_messages) {
    try {
      const msgs = JSON.parse(data._server_messages).map((m) => {
        try {
          return JSON.parse(m).message;
        } catch {
          return m;
        }
      });
      const text = stripHtml(msgs.join(" "));
      if (text) return text;
    } catch {
      /* ignore */
    }
  }
  if (typeof data.message === "string") return stripHtml(data.message);
  if (data.exception) return stripHtml(String(data.exception).split(":").slice(1).join(":") || data.exception);
  return "";
}

export async function call(method, { params, body, auth = true, server, timeout = 45000 } = {}) {
  const base = server ?? session.server;
  if (!base) throw new ApiError("Server address is not set");
  let url = `${base}/api/method/${method}`;
  if (params) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      q.set(k, typeof v === "string" ? v : JSON.stringify(v));
    });
    const qs = q.toString();
    if (qs) url += "?" + qs;
  }
  const headers = { Accept: "application/json" };
  if (auth && session.token) headers.Authorization = `token ${session.token}`;
  const opts = { method: body ? "POST" : "GET", headers };
  if (body) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  let res;
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new ApiError("The server took too long to respond", 0, "timeout")), timeout)
  );
  try {
    res = await Promise.race([fetch(url, opts), timer]);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(navigator.onLine === false ? "You are offline" : "Cannot reach the server", 0, "network");
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok || (data && data.exc_type)) {
    let msg = extractMessage(data);
    if (!msg && res.status === 404) msg = "This server does not have the measurement API installed";
    if (!msg && res.status === 403) msg = "You do not have permission for this action";
    throw new ApiError(msg || `Server error (${res.status})`, res.status, data?.exc_type || "");
  }
  return data ? data.message : null;
}

const M = "figleaf.api.mobile";

export const api = {
  ping: (server) => call("frappe.ping", { server, auth: false, timeout: 15000 }),
  login: (server, usr, pwd, device_id) =>
    call(`${M}.login`, { server, auth: false, body: { usr, pwd, device_id } }),
  whoami: () => call(`${M}.ping`),
  masterData: () => call(`${M}.get_master_data`),
  measurements: (since) => call(`${M}.get_measurements`, { params: { since } }),
  previous: (params) => call(`${M}.get_previous`, { params, timeout: 15000 }),
  setAssignmentStatus: (assignment, status) =>
    call(`${M}.set_assignment_status`, { body: { assignment, status } }),
  push: (records, device_id) =>
    call(`${M}.push_measurements`, { body: { records, device_id }, timeout: 90000 }),
};
