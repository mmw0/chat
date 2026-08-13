import { useAuth } from "@/_core/hooks/useAuth";
import { getDeviceIdentity } from "@/lib/e2ee";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function E2eeDeviceGuard() {
  const { user, isAuthenticated } = useAuth();
  const attempted = useRef(false);
  const [mismatch, setMismatch] = useState<{ encryptionPublicKey: string; signingPublicKey: string; fingerprint: string } | null>(null);
  const [password, setPassword] = useState("");
  const utils = trpc.useUtils();
  const publish = trpc.security.publishDeviceIdentity.useMutation({ onSuccess: () => void utils.auth.me.invalidate(), onError: error => toast.error("Encrypted device setup needs attention", { description: error.message }) });
  const recover = trpc.security.recoverDeviceIdentity.useMutation({ onSuccess: async () => { setMismatch(null); setPassword(""); await utils.auth.me.invalidate(); toast.success("Secure device recovered", { description: "New messages now use this browser. Older encrypted messages may remain unavailable." }); }, onError: error => toast.error("Could not recover this secure device", { description: error.message }) });

  useEffect(() => {
    if (!isAuthenticated || !user || attempted.current) return;
    attempted.current = true;
    void getDeviceIdentity(user.id, user.encryptionPublicKey).then(identity => {
      const encryptionPublicKey = JSON.stringify(identity.encryptionPublicJwk);
      const signingPublicKey = JSON.stringify(identity.signingPublicJwk);
      if (!user.encryptionPublicKey) publish.mutate({ encryptionPublicKey, signingPublicKey, fingerprint: identity.fingerprint });
      else if (user.encryptionPublicKey !== encryptionPublicKey || user.signingPublicKey !== signingPublicKey) setMismatch({ encryptionPublicKey, signingPublicKey, fingerprint: identity.fingerprint });
    }).catch(() => toast.error("Secure device storage is unavailable", { description: "Encrypted direct messaging cannot be activated in this browser." }));
  }, [isAuthenticated, user?.id]);

  if (!mismatch) return null;
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#101321]/55 p-4 backdrop-blur-sm"><section className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#202438] p-6 text-white shadow-2xl"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#B9E8CD]">Secure device recovery</p><h2 className="mt-2 font-display text-2xl">This browser needs setup.</h2><p className="mt-3 text-sm leading-6 text-[#C8D0DF]">Your account has an encrypted-device key that is not available in this browser. This can happen after clearing site data, changing browsers, or signing into a different device.</p><p className="mt-3 rounded-2xl bg-[#2D334B] p-3 text-xs leading-5 text-[#E6C9CD]">Replacing the key is permanent for this browser. It lets you send new encrypted messages, but older messages encrypted for the missing key may stay unreadable.</p><input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Current password" className="mt-5 w-full rounded-xl bg-white/10 px-3 py-3 outline-none" /><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => setMismatch(null)} className="orbit-button rounded-xl border border-white/15 py-3 text-sm font-bold">Not now</button><button disabled={password.length < 8 || recover.isPending} onClick={() => recover.mutate({ ...mismatch, currentPassword: password, confirmation: "REPLACE_DEVICE_KEY" })} className="orbit-button rounded-xl bg-[#DDF5C9] py-3 text-sm font-bold text-[#193B29] disabled:opacity-40">Use this browser</button></div></section></div>;
}
