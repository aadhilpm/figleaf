import { useCallback, useEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { api, ApiError, setSession } from "./lib/api.js";
import { clearAll, db, getMeta, personKey, setMeta, todayISO, uuid } from "./lib/db.js";
import { refreshPendingCount, syncAll } from "./lib/sync.js";
import {
  clearAccount,
  clearBiometric,
  deviceId,
  enableBiometric,
  isNative,
  loadAccount,
  loadPlainToken,
  removePlainToken,
  saveAccount,
  savePlainToken,
  unlockWithBiometric,
} from "./lib/account.js";
import { BiometricOffer, LockScreen, LoginScreen, ServerScreen } from "./screens/Auth.jsx";
import { AssignmentScreen, HomeScreen } from "./screens/Home.jsx";
import { DetailsScreen, EntryScreen, PrintScreen, ViewScreen, buildValues } from "./screens/Measure.jsx";
import { SettingsScreen } from "./screens/Settings.jsx";
import { Sheet, useToast } from "./components/ui.jsx";

// what counts as "entered" on a draft, for the discard check
const snap = (d) =>
  JSON.stringify([
    d.customer_name,
    d.person_name,
    d.employee_code,
    d.designation,
    d.remarks,
    (d.values || []).filter((v) => v.value || v.notes).map((v) => [v.garment, v.measurement_type, v.value, v.notes]),
  ]);

const VERSION = "1.1.0";
const LOCK_AFTER_MS = 5 * 60 * 1000;
const AUTO_SYNC_MS = 5 * 60 * 1000;

function blankDraft(base = {}) {
  return {
    id: null,
    app_uuid: null,
    name: null,
    assignment: "",
    customer: "",
    customer_name: "",
    quotation: "",
    person_name: "",
    employee_code: "",
    designation: "",
    gender: "",
    measurement_date: todayISO(),
    sales_order: "",
    ref_no: "",
    unit: "Inch",
    remarks: "",
    garments: [],
    values: [],
    ...base,
  };
}

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | server | login | locked | offer-bio | app
  const [account, setAccount] = useState(null);
  const [pendingServer, setPendingServer] = useState("");
  const [token, setToken] = useState("");
  const [online, setOnline] = useState(true);
  const [garments, setGarments] = useState([]);
  const [config, setConfig] = useState({ units: [], settings: {}, phone_unit: "", measurement_types: [] });
  const [stack, setStack] = useState([{ screen: "home" }]);
  const [draft, setDraft] = useState(blankDraft());
  const [saving, setSaving] = useState(false);
  const [draftBase, setDraftBase] = useState("");
  const [askDiscard, setAskDiscard] = useState(false);
  const [toast, showToast] = useToast();
  const hiddenAt = useRef(0);

  const top = stack[stack.length - 1];
  const push = (screen, props = {}) => setStack((s) => [...s, { screen, ...props }]);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = (screen = "home", props = {}) => setStack([{ screen: "home" }, ...(screen === "home" ? [] : [{ screen, ...props }])]);

  const loadGarments = useCallback(async () => {
    setGarments(await getMeta("garments", []));
    setConfig({
      units: await getMeta("units", []),
      settings: await getMeta("settings", {}),
      phone_unit: await getMeta("phone_unit", ""),
      measurement_types: await getMeta("measurement_types", []),
    });
  }, []);

  const defaultUnit = () => {
    const ok = (u) => u && (!config.units.length || config.units.some((x) => x.name === u));
    if (ok(config.phone_unit)) return config.phone_unit;
    if (ok(config.settings.default_unit)) return config.settings.default_unit;
    return config.units[0]?.name || "Inch";
  };

  // ---------------------------------------------------------------- boot
  useEffect(() => {
    (async () => {
      const acc = await loadAccount();
      if (!acc) return setPhase("server");
      setAccount(acc);
      setSession({ server: acc.server, token: "" });
      if (acc.biometric && isNative()) return setPhase("locked");
      const t = await loadPlainToken();
      if (!t) return setPhase("login");
      startSession(acc, t);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- connectivity, resume
  useEffect(() => {
    let h1, h2, h3;
    Network.getStatus().then((s) => setOnline(s.connected)).catch(() => setOnline(navigator.onLine));
    Network.addListener("networkStatusChange", (s) => setOnline(s.connected)).then((h) => (h1 = h));
    if (isNative()) {
      CapApp.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) hiddenAt.current = Date.now();
        else if (hiddenAt.current && Date.now() - hiddenAt.current > LOCK_AFTER_MS) {
          setAccount((acc) => {
            if (acc?.biometric) {
              setToken("");
              setSession({ token: "" });
              setPhase((p) => (p === "app" ? "locked" : p));
            }
            return acc;
          });
        }
      }).then((h) => (h2 = h));
    }
    return () => {
      h1?.remove();
      h2?.remove();
      h3?.remove();
    };
  }, []);

  const runSync = useCallback(
    async (opts = {}) => {
      if (!token) return;
      try {
        const res = await syncAll({ ...opts, deviceId: await deviceId() });
        await loadGarments();
        if (opts.manual) {
          if (res?.error) showToast(`Sync failed: ${res.error}`);
          else
            showToast(
              res.pushed || res.conflicts || res.failed
                ? `Sent ${res.pushed}${res.failed ? `, ${res.failed} failed` : ""}${res.conflicts ? `, ${res.conflicts} changed in ERPNext` : ""}`
                : "Up to date"
            );
        }
      } catch (e) {
        if (e instanceof ApiError && e.isAuth) {
          showToast("Session expired. Please sign in again.");
          await removePlainToken();
          if (account?.biometric) await clearBiometric(account.server);
          setAccount((a) => (a ? { ...a, biometric: false } : a));
          setToken("");
          setPhase("login");
        }
      }
    },
    [token, account, loadGarments, showToast]
  );

  // sync when coming online, and every few minutes while open
  useEffect(() => {
    if (phase !== "app" || !online || !token) return;
    runSync();
    const t = setInterval(() => runSync(), AUTO_SYNC_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, online, token]);

  // ---------------------------------------------------------------- android back
  useEffect(() => {
    if (!isNative()) return;
    let h;
    CapApp.addListener("backButton", () => {
      if (phase !== "app") return CapApp.minimizeApp();
      if (askDiscard) return setAskDiscard(false);
      const cur = stack[stack.length - 1];
      if ((cur.screen === "entry" || (cur.screen === "details" && cur.isNew)) && snap(draft) !== draftBase) {
        setAskDiscard(true);
        return;
      }
      setStack((s) => {
        if (s.length > 1) return s.slice(0, -1);
        CapApp.minimizeApp();
        return s;
      });
    }).then((x) => (h = x));
    return () => h?.remove();
  }, [phase, stack, draft, draftBase, askDiscard]);

  function leaveDraft() {
    if (snap(draft) !== draftBase) setAskDiscard(true);
    else pop();
  }

  // ---------------------------------------------------------------- auth handlers
  function startSession(acc, t) {
    setSession({ server: acc.server, token: t });
    setToken(t);
    // refresh the company name and user's full name from the server (if online)
    api
      .whoami()
      .then((me) => {
        if (!me) return;
        const next = { ...acc, full_name: me.full_name || acc.full_name, company: me.company || acc.company };
        if (next.company !== acc.company || next.full_name !== acc.full_name) {
          saveAccount(next);
          setAccount((a) => (a ? { ...a, company: next.company, full_name: next.full_name } : a));
        }
      })
      .catch(() => {});
    loadGarments();
    refreshPendingCount();
    setPhase("app");
  }

  async function handleLogin(usr, pwd) {
    const server = pendingServer || account?.server;
    const res = await api.login(server, usr, pwd, await deviceId());
    const prev = account;
    // a different server or user: start with a clean phone database
    if (prev && (prev.server !== server || prev.user !== res.user)) {
      const pending = await db.measurements.where("status").anyOf("pending", "error").count();
      if (pending) throw new Error(`${pending} measurement(s) from ${prev.user} are not synced. Sign in as that user and sync first.`);
      await clearAll();
    }
    const acc = { server, user: res.user, full_name: res.full_name, company: res.company || "", biometric: false };
    await saveAccount(acc);
    await savePlainToken(res.token);
    setAccount(acc);
    setSession({ server, token: res.token });
    setToken(res.token);
    setPhase(isNative() ? "offer-bio" : "app");
    if (!isNative()) startSession(acc, res.token);
  }

  async function handleUnlock() {
    const t = await unlockWithBiometric(account.server);
    startSession(account, t);
  }

  async function turnBiometric(on) {
    if (on) {
      await enableBiometric(account.server, account.user, token);
      await removePlainToken();
    } else {
      await clearBiometric(account.server);
      await savePlainToken(token);
    }
    const acc = { ...account, biometric: on };
    await saveAccount(acc);
    setAccount(acc);
  }

  async function logout() {
    await clearAccount(account);
    await clearAll();
    setToken("");
    setSession({ token: "" });
    setPendingServer(account.server);
    setAccount(null);
    setStack([{ screen: "home" }]);
    setPhase("login");
  }

  // ---------------------------------------------------------------- measurement handlers
  function newMeasurement(base = {}) {
    const d = blankDraft({ unit: defaultUnit(), ...base });
    setDraft(d);
    setDraftBase(snap(d));
    push("details", { isNew: true });
  }

  function measureFor(a) {
    const gs = (a.garments || []).map((g) => g.garment).filter((g) => garments.some((x) => x.name === g));
    newMeasurement({
      assignment: a.name,
      customer: a.customer || "",
      customer_name: a.party_name,
      sales_order: a.sales_order || "",
      quotation: a.quotation || "",
      ref_no: a.sales_order || a.quotation || "",
      garments: gs,
      values: buildValues(gs, garments, []),
    });
  }

  async function markDone(name) {
    await runSync(); // send anything pending first
    const pending = await db.measurements
      .where("assignment")
      .equals(name)
      .filter((r) => r.status !== "synced")
      .count();
    if (pending) throw new Error(`${pending} measurement(s) could not be sent yet. Try again when online.`);
    await api.setAssignmentStatus(name, "Completed");
    await runSync();
    reset();
    showToast("Assignment marked as done");
  }

  async function editMeasurement(id) {
    const rec = await db.measurements.get(id);
    if (!rec) return;
    const d = { ...blankDraft(), ...rec, values: buildValues(rec.garments, garments, rec.values) };
    setDraft(d);
    setDraftBase(snap(d));
    push("entry");
  }

  async function saveDraft(nextPerson) {
    setSaving(true);
    try {
      const id = draft.id || uuid();
      const rec = {
        ...draft,
        id,
        app_uuid: id,
        person_name: draft.person_name.trim(),
        person_key: personKey(draft.employee_code, draft.person_name),
        status: "pending",
        error: null,
        conflict: null,
        editable: true,
        source: "Mobile App",
        measured_by: draft.measured_by || account.user,
        updated_at: Date.now(),
      };
      await db.measurements.put(rec);
      await refreshPendingCount();
      showToast(online ? "Saved, syncing…" : "Saved on this phone, will sync when online");
      if (online) runSync();
      if (nextPerson) {
        const next = blankDraft({
            assignment: rec.assignment,
            customer: rec.customer,
            customer_name: rec.customer_name,
            quotation: rec.quotation,
            sales_order: rec.sales_order,
            ref_no: rec.ref_no,
            unit: rec.unit,
            measurement_date: rec.measurement_date,
            garments: rec.garments,
            values: buildValues(rec.garments, garments, []),
          });
        setDraft(next);
        setDraftBase(snap(next));
        setStack([...(rec.assignment ? [{ screen: "home" }, { screen: "assignment", name: rec.assignment }] : [{ screen: "home" }]), { screen: "details", isNew: true }]);
      } else {
        setStack([...(rec.assignment ? [{ screen: "home" }, { screen: "assignment", name: rec.assignment }] : [{ screen: "home" }]), { screen: "view", id }]);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteLocal(id) {
    await db.measurements.delete(id);
    await refreshPendingCount();
    reset();
    showToast("Deleted");
  }

  async function retry(id) {
    await db.measurements.update(id, { status: "pending", error: null });
    runSync({ manual: true });
  }

  // ---------------------------------------------------------------- render
  if (phase === "loading") return <div className="screen" />;
  if (phase === "server")
    return (
      <ServerScreen
        initial={pendingServer}
        onNext={(url) => {
          setPendingServer(url);
          setPhase("login");
        }}
      />
    );
  if (phase === "login")
    return (
      <>
        <LoginScreen
          server={pendingServer || account?.server}
          initialUser={account?.user}
          onBack={() => setPhase("server")}
          onLogin={handleLogin}
        />
        {toast}
      </>
    );
  if (phase === "locked")
    return (
      <LockScreen
        account={account}
        onUnlock={handleUnlock}
        onPassword={() => {
          setPendingServer(account.server);
          setPhase("login");
        }}
      />
    );
  if (phase === "offer-bio")
    return (
      <BiometricOffer
        onEnable={async () => {
          await turnBiometric(true);
          startSession({ ...account, biometric: true }, token);
        }}
        onSkip={() => startSession(account, token)}
      />
    );

  let screen;
  switch (top.screen) {
    case "details":
      screen = (
        <DetailsScreen
          draft={draft}
          setDraft={setDraft}
          garments={garments}
          config={config}
          isNew={top.isNew}
          onBack={top.isNew ? leaveDraft : pop}
          onNext={() => {
            setDraft((d) => ({ ...d, values: buildValues(d.garments, garments, d.values) }));
            if (top.isNew) setStack((s) => [...s.slice(0, -1), { screen: "entry" }]);
            else pop();
          }}
        />
      );
      break;
    case "assignment":
      screen = (
        <AssignmentScreen
          name={top.name}
          online={online}
          onBack={pop}
          onMeasure={measureFor}
          onOpen={(id) => push("view", { id })}
          onMarkDone={markDone}
        />
      );
      break;
    case "entry":
      screen = (
        <EntryScreen
          draft={draft}
          setDraft={setDraft}
          garments={garments}
          config={config}
          online={online}
          saving={saving}
          onBack={leaveDraft}
          onDetails={() => push("details", { isNew: false })}
          onSave={saveDraft}
        />
      );
      break;
    case "view":
      screen = (
        <ViewScreen
          id={top.id}
          garments={garments}
          config={config}
          onBack={pop}
          onPrint={() => push("print", { id: top.id })}
          onEdit={() => editMeasurement(top.id)}
          onDelete={() => deleteLocal(top.id)}
          onRetry={() => retry(top.id)}
        />
      );
      break;
    case "print":
      screen = <PrintScreen id={top.id} garments={garments} config={config} company={account.company} onBack={pop} />;
      break;
    case "settings":
      screen = (
        <SettingsScreen
          account={account}
          online={online}
          version={VERSION}
          config={config}
          garments={garments}
          onPhoneUnit={async (u) => {
            await setMeta("phone_unit", u);
            setConfig((c) => ({ ...c, phone_unit: u }));
          }}
          onBack={pop}
          onSync={() => runSync({ manual: true })}
          onFullSync={() => runSync({ manual: true, full: true })}
          onToggleBiometric={turnBiometric}
          onLogout={logout}
        />
      );
      break;
    default:
      screen = (
        <HomeScreen
          account={account}
          online={online}
          config={config}
          onOpenAssignment={(name) => push("assignment", { name })}
          onNewFor={measureFor}
          onNewWalkIn={() => newMeasurement()}
          onOpen={(id) => push("view", { id })}
          onSync={() => runSync({ manual: true })}
          onSettings={() => push("settings")}
        />
      );
  }

  return (
    <>
      {screen}
      {askDiscard ? (
        <Sheet title="Discard this measurement?" onClose={() => setAskDiscard(false)}>
          <p className="small">The values you entered have not been saved.</p>
          <div className="btn-row">
            <button className="btn secondary" onClick={() => setAskDiscard(false)}>
              Keep editing
            </button>
            <button
              className="btn danger"
              onClick={() => {
                setAskDiscard(false);
                setDraftBase(snap(draft));
                setStack((s) => {
                  const i = s.findIndex((x) => x.screen === "entry" || (x.screen === "details" && x.isNew));
                  return i > 0 ? s.slice(0, i) : [{ screen: "home" }];
                });
              }}
            >
              Discard
            </button>
          </div>
        </Sheet>
      ) : null}
      {toast}
    </>
  );
}
