// Account, token storage and fingerprint unlock.
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Device } from "@capacitor/device";
import { NativeBiometric, AccessControl } from "@capgo/capacitor-native-biometric";

const ACCOUNT_KEY = "account";
const TOKEN_KEY = "token"; // only used when fingerprint is off

export const isNative = () => Capacitor.isNativePlatform();

export async function loadAccount() {
  const { value } = await Preferences.get({ key: ACCOUNT_KEY });
  return value ? JSON.parse(value) : null;
}

export async function saveAccount(account) {
  await Preferences.set({ key: ACCOUNT_KEY, value: JSON.stringify(account) });
}

export async function clearAccount(account) {
  if (account?.biometric) await clearBiometric(account.server);
  await Preferences.remove({ key: TOKEN_KEY });
  await Preferences.remove({ key: ACCOUNT_KEY });
}

export async function savePlainToken(token) {
  await Preferences.set({ key: TOKEN_KEY, value: token });
}

export async function loadPlainToken() {
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  return value || "";
}

export async function removePlainToken() {
  await Preferences.remove({ key: TOKEN_KEY });
}

let cachedDeviceId = null;
export async function deviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const [{ identifier }, info] = await Promise.all([Device.getId(), Device.getInfo()]);
    cachedDeviceId = `${info.manufacturer || ""} ${info.model || ""} (${identifier})`.trim();
  } catch {
    cachedDeviceId = "web";
  }
  return cachedDeviceId;
}

// ---------------------------------------------------------------- biometric

const credKey = (server) => `measure:${server}`;

export async function biometricStatus() {
  if (!isNative()) return { available: false, reason: "Fingerprint unlock works in the Android app only" };
  try {
    const r = await NativeBiometric.isAvailable({ useFallback: false });
    return { available: !!r.isAvailable, type: r.biometryType, code: r.errorCode };
  } catch (e) {
    return { available: false, reason: e.message };
  }
}

/** Store the API token so it can only be read after a fingerprint check. */
export async function enableBiometric(server, user, token) {
  await NativeBiometric.verifyIdentity({
    reason: "Confirm to enable fingerprint unlock",
    title: "Enable fingerprint unlock",
    negativeButtonText: "Cancel",
  });
  await NativeBiometric.setCredentials({
    server: credKey(server),
    username: user,
    password: token,
    accessControl: AccessControl.BIOMETRY_CURRENT_SET,
  });
}

/** Prompt for fingerprint and return the stored token. */
export async function unlockWithBiometric(server) {
  const c = await NativeBiometric.getSecureCredentials({
    server: credKey(server),
    reason: "Unlock Measurement Entry",
    title: "Unlock Measurement Entry",
    subtitle: server.replace(/^https?:\/\//, ""),
    negativeButtonText: "Use password",
  });
  return c.password;
}

export async function clearBiometric(server) {
  if (!isNative()) return;
  try {
    await NativeBiometric.deleteCredentials({ server: credKey(server) });
  } catch {
    /* nothing stored */
  }
}
