import { useAuth } from "@/_core/hooks/useAuth";
import { LockKeyhole, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

export function SecurityStatusDock() {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  if (!isAuthenticated) return null;
  const ready = Boolean(user?.encryptionPublicKey && user?.signingPublicKey);
  return <div className="fixed right-4 top-4 z-30 sm:right-6 sm:top-6"><button onClick={() => setOpen(true)} className="orbit-button flex items-center gap-2 rounded-2xl border border-[#B8D8A7] bg-[#F2FAEC] px-3 py-2 text-xs font-bold text-[#31563B] shadow-[0_10px_24px_rgba(49,86,59,.12)]"><ShieldCheck className="size-4" />{ready ? "Secure device" : "Securing device"}</button>{open && <div className="absolute right-0 top-0 w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-[#D8E6D1] bg-[#FCFBF8] p-4 text-[#252B3E] shadow-2xl"><button onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-lg p-1 text-[#7A8291]" aria-label="Close security status"><X className="size-4" /></button><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#527A5D]">Security status</p><h2 className="mt-1 pr-6 font-display text-lg font-semibold">{ready ? "This device is ready for encrypted chats" : "Setting up device-held encryption"}</h2><p className="mt-2 text-xs leading-5 text-[#5F6878]">When both approved contacts finish setup, Orbit encrypts new message content in the browser before it is sent. The service stores ciphertext and public keys, not readable new-message content.</p>{ready && <div className="mt-3 rounded-2xl bg-[#EFF8EA] p-3 text-xs text-[#31563B]"><LockKeyhole className="mr-1 inline size-3" />Device fingerprint: <span className="font-mono">{user?.encryptionFingerprint}</span></div>}<p className="mt-3 text-[10px] leading-4 text-[#7A8291]">Message content encryption does not hide who you contact, timestamps, or ciphertext size. Device loss, browser-data clearing, malware, screenshots, and unverified key changes remain risks. Orbit does not send encrypted content to server-side search.</p></div>}</div>;
}
