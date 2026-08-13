const glyphs = ["✦", "◒", "☄", "◈", "✺", "◌", "⌁", "✧", "◐", "☾"] as const;
const palettes = [
  ["#DFF2C5", "#21412B"], ["#DDD9FF", "#34305B"], ["#FFE0BE", "#653D1E"], ["#CBEAE6", "#194A48"], ["#FFD8E4", "#633143"],
  ["#D8E5FF", "#263E6C"], ["#F5E6B8", "#5E4B14"], ["#E2D6FF", "#49366E"], ["#CEE8D0", "#2E5332"], ["#F5D6C9", "#6B3E32"],
] as const;

export type OrbitAvatar = { id: string; glyph: string; background: string; foreground: string; label: string };

export const orbitAvatars: OrbitAvatar[] = Array.from({ length: 100 }, (_, index) => {
  const number = index + 1;
  const [background, foreground] = palettes[index % palettes.length];
  return {
    id: `orbit-${String(number).padStart(2, "0")}`,
    glyph: glyphs[index % glyphs.length],
    background,
    foreground,
    label: `Orbit glyph ${String(number).padStart(2, "0")}`,
  };
});

export function getOrbitAvatar(avatarId?: string | null): OrbitAvatar {
  return orbitAvatars.find(avatar => avatar.id === avatarId) ?? orbitAvatars[0];
}
