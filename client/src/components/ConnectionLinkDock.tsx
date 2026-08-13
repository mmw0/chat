import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Check, Copy, Link2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function ConnectionLinkDock() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const createLink = trpc.contacts.createTrustedLink.useMutation({
    onSuccess: result => {
      const value = `${window.location.origin}${result.path}`;
      setLink(value);
      void navigator.clipboard?.writeText(value);
      toast.success("One-time connection link copied", { description: "It expires in 24 hours or after one use." });
    },
    onError: error => toast.error(error.message),
  });

  if (!isAuthenticated) return null;
  return <div className="fixed bottom-24 right-4 z-30 sm:bottom-28 sm:right-6"><button onClick={() => setOpen(true)} className="orbit-button flex items-center gap-2 rounded-2xl bg-[#252B3E] px-4 py-3 text-xs font-bold text-white shadow-[0_14px_35px_rgba(37,43,62,.28)]"><Link2 className="size-4" />Share a one-time link</button>{open && <div className="absolute bottom-0 right-0 w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-[#DED9CE] bg-[#FCFBF8] p-4 text-[#252B3E] shadow-2xl"><button onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-lg p-1 text-[#7A8291]"><X className="size-4" /></button><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#6B7F70]">Trusted connection</p><h2 className="mt-1 pr-6 font-display text-lg font-semibold">Share a private chat link</h2><p className="mt-2 text-xs leading-5 text-[#6F7787]">One person can use this link within 24 hours. It creates a direct connection without a request step.</p>{link ? <div className="mt-4 rounded-2xl border border-[#DCE7D5] bg-white p-3"><p className="break-all font-mono text-[10px] text-[#4B5668]">{link}</p><button onClick={() => { void navigator.clipboard?.writeText(link); toast.success("Link copied"); }} className="orbit-button mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#C9DEC0] py-2 text-xs font-bold text-[#31563B]"><Copy className="size-3" />Copy link</button></div> : <button onClick={() => createLink.mutate()} disabled={createLink.isPending} className="orbit-button mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#DDF5C9] py-3 text-xs font-bold text-[#21412B] disabled:opacity-50">{createLink.isPending ? "Creating link…" : <><Link2 className="size-3" />Generate link</>}</button>}<p className="mt-3 flex items-center gap-1.5 text-[10px] text-[#7A8291]"><Check className="size-3 text-[#4E8051]" />One use only · no external sharing required</p></div>}</div>;
}
