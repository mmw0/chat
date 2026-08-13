import { useEffect } from "react";

/** Keeps any already-mounted menu label aligned with Orbit's private-only chat removal policy. */
export function PrivateChatCopyGuard() {
  useEffect(() => {
    const normalize = () => {
      document.querySelectorAll("button").forEach(button => {
        const textNode = Array.from(button.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("Delete chat for both"));
        if (textNode) textNode.textContent = "Remove chat for me";
      });
    };
    normalize();
    const observer = new MutationObserver(normalize);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
