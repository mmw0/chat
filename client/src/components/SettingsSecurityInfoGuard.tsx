import { useEffect } from "react";

export function SettingsSecurityInfoGuard() {
  useEffect(() => {
    const insertSecurityInfo = () => {
      const marker = Array.from(document.querySelectorAll("p")).find(element => element.textContent?.trim() === "Private profile");
      const dialog = marker?.closest(".max-h-\\[92dvh\\]") as HTMLElement | null;
      if (!dialog || dialog.querySelector("[data-orbit-security-settings]")) return;
      const deletionButton = Array.from(dialog.querySelectorAll("button")).find(button => button.textContent?.includes("Delete account permanently"));
      if (!deletionButton) return;
      const section = document.createElement("section");
      section.dataset.orbitSecuritySettings = "true";
      section.className = "mt-6 border-t border-white/10 pt-5";
      section.innerHTML = `<p class="font-bold">Secure device</p><p class="mt-1 text-xs leading-5 text-[#BCC3D4]">New private messages use this browser’s device key once both people finish secure setup. If this browser no longer holds your key, Orbit opens a password-confirmed recovery step before sending new encrypted messages.</p><p class="mt-2 text-[10px] leading-4 text-[#929BB3]">Recovery protects new messages on this browser; messages encrypted for a lost key can remain unavailable.</p>`;
      dialog.insertBefore(section, deletionButton);
    };
    insertSecurityInfo();
    const observer = new MutationObserver(insertSecurityInfo);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
