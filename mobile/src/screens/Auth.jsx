import { useEffect, useRef, useState } from "react";
import { api, normalizeServer } from "../lib/api.js";
import { biometricStatus, isNative } from "../lib/account.js";
import { Field, Icon } from "../components/ui.jsx";

function Brand({ sub, title = "Measurement Entry" }) {
  return (
    <>
      <div className="brand-mark">
        <Icon name="tape" />
      </div>
      <h2 className="hero-title">{title}</h2>
      <p className="hero-sub">{sub}</p>
    </>
  );
}

export function ServerScreen({ initial, onNext }) {
  const [server, setServer] = useState(initial || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    const url = normalizeServer(server);
    if (!url) return setErr("Enter your ERPNext web address, for example erp.yourcompany.com");
    setBusy(true);
    setErr("");
    try {
      const pong = await api.ping(url);
      if (pong !== "pong") throw new Error("This address is not an ERPNext / Frappe site");
      onNext(url);
    } catch (e2) {
      setErr(e2.message || "Cannot reach this address");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="scroll">
        <form className="center" onSubmit={submit}>
          <Brand sub="Record customer measurements, online or offline." />
          <Field label="ERPNext web address" required>
            <input
              className="input"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="erp.yourcompany.com"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              autoFocus
            />
          </Field>
          {err ? <div className="err-text">{err}</div> : null}
          <button className="btn" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function LoginScreen({ server, initialUser, onBack, onLogin }) {
  const [usr, setUsr] = useState(initialUser || "");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!usr || !pwd) return setErr("Enter your username and password");
    setBusy(true);
    setErr("");
    try {
      await onLogin(usr.trim(), pwd);
    } catch (e2) {
      setErr(e2.message || "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="scroll">
        <form className="center" onSubmit={submit}>
          <Brand sub={server.replace(/^https?:\/\//, "")} />
          <Field label="Username or email" required>
            <input className="input" value={usr} onChange={(e) => setUsr(e.target.value)} autoCapitalize="off" autoCorrect="off" autoComplete="username" autoFocus={!initialUser} />
          </Field>
          <Field label="Password" required>
            <input className="input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" autoFocus={!!initialUser} />
          </Field>
          {err ? <div className="err-text">{err}</div> : null}
          <button className="btn" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" className="btn ghost" onClick={onBack} style={{ marginTop: 8 }}>
            Change web address
          </button>
        </form>
      </div>
    </div>
  );
}

export function LockScreen({ account, onUnlock, onPassword }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const tried = useRef(false);

  async function unlock() {
    setBusy(true);
    setErr("");
    try {
      await onUnlock();
    } catch (e) {
      const code = e?.code ?? e?.data?.code;
      // 16 = user cancelled, 17 = chose fallback ("Use password")
      if (String(code) === "17" || /fallback|negative|use password/i.test(e?.message || "")) {
        onPassword();
        return;
      }
      if (String(code) === "21" || /no protected credentials/i.test(e?.message || "")) {
        setErr("Fingerprint unlock was reset on this phone. Sign in with your password.");
      } else if (!/cancel/i.test(e?.message || "")) {
        setErr(e?.message || "Could not unlock");
      }
      setBusy(false);
    }
  }

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen">
      <div className="scroll">
        <div className="center">
          <Brand title={account.company || "Measurement Entry"} sub={account.full_name || account.user} />
          <p className="small" style={{ textAlign: "center", marginTop: -16, marginBottom: 28 }}>
            {account.server.replace(/^https?:\/\//, "")}
          </p>
          {err ? <div className="err-text" style={{ textAlign: "center" }}>{err}</div> : null}
          <button className="btn" onClick={unlock} disabled={busy}>
            <Icon name="finger" width="22" height="22" /> Unlock with fingerprint
          </button>
          <button className="btn ghost" onClick={onPassword} style={{ marginTop: 8 }}>
            Use password instead
          </button>
        </div>
      </div>
    </div>
  );
}

export function BiometricOffer({ onEnable, onSkip }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    biometricStatus().then(setStatus);
  }, []);
  useEffect(() => {
    if (status && !status.available) onSkip();
  }, [status, onSkip]);
  if (!status || !status.available || !isNative()) return null;

  return (
    <div className="screen">
      <div className="scroll">
        <div className="center">
          <div className="brand-mark">
            <Icon name="finger" />
          </div>
          <h2 className="hero-title">Unlock with fingerprint?</h2>
          <p className="hero-sub">Next time, open the app with your fingerprint instead of typing your password.</p>
          {err ? <div className="err-text">{err}</div> : null}
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr("");
              try {
                await onEnable();
              } catch (e) {
                setErr(/cancel/i.test(e?.message || "") ? "" : e?.message || "Could not enable fingerprint");
                setBusy(false);
              }
            }}
          >
            Use fingerprint
          </button>
          <button className="btn ghost" onClick={onSkip} style={{ marginTop: 8 }}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
