import { useAuth } from "@/_core/hooks/useAuth";
import { orderPersonalConversations } from "@shared/conversationControls";
import { Archive, Heart, Tag, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function ConversationOrganizerDock() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: contacts = [] } = trpc.contacts.list.useQuery(undefined, { enabled: isAuthenticated && open });
  const utils = trpc.useUtils();
  const organize = trpc.chat.setOrganization.useMutation({
    onSuccess: () => { void utils.contacts.list.invalidate(); toast.success("Personal organization updated"); },
    onError: error => toast.error(error.message),
  });
  const personalContacts = useMemo(() => orderPersonalConversations(contacts.filter(contact => !contact.archivedAt && contact.conversationId)), [contacts]);

  if (!isAuthenticated) return null;
  return <div className="fixed bottom-4 left-40 z-30 sm:bottom-6 sm:left-44"><button onClick={() => setOpen(true)} className="orbit-button flex items-center gap-2 rounded-2xl border border-[#D8D3C8] bg-[#FCFBF8] px-4 py-3 text-xs font-bold text-[#252B3E] shadow-[0_14px_35px_rgba(37,43,62,.12)]"><Tag className="size-4 text-[#7B586B]" />Organize chats</button>{open && <div className="absolute bottom-0 left-0 w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-[#DED9CE] bg-[#FCFBF8] p-4 text-[#252B3E] shadow-2xl"><button onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-lg p-1 text-[#7A8291]" aria-label="Close organizer"><X className="size-4" /></button><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#7B586B]">Personal workspace</p><h2 className="mt-1 pr-6 font-display text-lg font-semibold">Favorites & labels</h2><p className="mt-2 text-xs leading-5 text-[#6F7787]">These private shortcuts change only your Orbit view. Archived chats stay out of this list.</p><div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{personalContacts.length ? personalContacts.map(contact => <div key={contact.id} className="rounded-2xl border border-[#E3DED4] bg-white p-3"><div className="flex items-center gap-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">@{contact.username}</p><p className="text-[10px] text-[#7A8291]">{contact.personalLabel || "No personal label"}</p></div><button onClick={() => organize.mutate({ conversationId: contact.conversationId!, favorite: !contact.isFavorite, label: contact.personalLabel })} disabled={organize.isPending} className="orbit-button rounded-xl p-2 text-[#A04B6B] disabled:opacity-40" aria-label={contact.isFavorite ? "Remove favorite" : "Add favorite"}><Heart className="size-4" fill={contact.isFavorite ? "currentColor" : "none"} /></button></div><input defaultValue={contact.personalLabel || ""} onBlur={event => { const label = event.currentTarget.value.trim() || null; if (label !== contact.personalLabel) organize.mutate({ conversationId: contact.conversationId!, favorite: contact.isFavorite, label }); }} maxLength={32} placeholder="Add a private label" className="mt-2 w-full rounded-xl border border-[#E3DED4] bg-[#FCFBF8] px-3 py-2 text-xs outline-none focus:border-[#B5CDA7]" /></div>) : <div className="rounded-2xl border border-dashed border-[#D8D3C8] p-5 text-center text-xs text-[#7A8291]"><Archive className="mx-auto mb-2 size-4" />Add a direct contact to organize your personal chat list.</div>}</div></div>}</div>;
}
