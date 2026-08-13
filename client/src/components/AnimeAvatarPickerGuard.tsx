import { AnimeAvatar } from "@/components/AnimeAvatar";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";

const mounted = new WeakSet<HTMLButtonElement>();

/** Upgrades the existing 100-choice profile selector to preview the vector anime portraits without changing its established selection behavior. */
export function AnimeAvatarPickerGuard() {
  useEffect(() => {
    const normalize = () => {
      document.querySelectorAll<HTMLButtonElement>('button[title^="Orbit glyph "]').forEach(button => {
        if (mounted.has(button)) return;
        const number = button.title.replace(/\D/g, "").padStart(2, "0");
        button.title = `Anime avatar ${number}`;
        button.setAttribute("aria-label", `Select anime avatar ${number}`);
        mounted.add(button);
        createRoot(button).render(<AnimeAvatar avatarId={`orbit-${number}`} className="size-full" />);
      });
      document.querySelectorAll("p").forEach(paragraph => {
        if (paragraph.textContent?.includes("Choose from 100 built-in Orbit glyphs")) paragraph.textContent = "Choose from 100 built-in, non-photographic anime-style avatars. Photos and external image uploads are intentionally not supported.";
      });
    };
    normalize();
    const observer = new MutationObserver(normalize);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
