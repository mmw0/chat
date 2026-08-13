import { getOrbitAvatar } from "@/lib/orbitAvatars";

function seedFromId(avatarId?: string | null) {
  const number = Number((avatarId || "orbit-01").split("-")[1]) || 1;
  return Math.max(1, Math.min(100, number));
}

export function AnimeAvatar({ avatarId, className = "size-10" }: { avatarId?: string | null; className?: string }) {
  const seed = seedFromId(avatarId);
  const avatar = getOrbitAvatar(avatarId);
  const skin = ["#F7D5C0", "#EFC19F", "#C98F70", "#9B624B", "#6A4136"][seed % 5];
  const hair = ["#2B2639", "#61433B", "#385E85", "#7F496B", "#2F6A59", "#C27442", "#6A4B93"][seed % 7];
  const eye = ["#384A6D", "#695642", "#536C45", "#7B4B70", "#4B6D73"][seed % 5];
  const longHair = seed % 3 === 0;
  const fringe = seed % 4;
  const glasses = seed % 7 === 0;
  const accessory = seed % 6 === 0;
  return <svg viewBox="0 0 64 64" aria-label={avatar.label} className={className} role="img"><rect width="64" height="64" rx="18" fill={avatar.background} /><path d={`M${longHair ? 13 : 17} 56c1-13 7-20 19-20s18 7 19 20`} fill={hair} opacity=".86" /><circle cx="32" cy="29" r="16" fill={skin} /><path d={longHair ? "M15 32c0-17 7-25 18-25 13 0 20 10 18 27l-6-7-2-13-7 4-9-3-6 10z" : "M15 30c1-16 9-23 18-23 13 0 18 10 16 24l-6-8-9 2-8-5-6 10z"} fill={hair} /><path d={fringe === 0 ? "M18 20c7-9 22-9 28 0-7-2-11 4-17 2-5-2-7 1-11 4z" : fringe === 1 ? "M18 20c10-12 24-7 29 1-8 1-13-2-19 4-4-4-6-3-10-5z" : fringe === 2 ? "M17 20c6-11 23-12 30 0-7 3-11-2-15 4-5-7-8-1-15-4z" : "M18 21c5-12 23-13 29 0-9-2-12 5-17 2-5 3-8-3-12-2z"} fill={hair} /><ellipse cx="26" cy="30" rx="3.1" ry="3.8" fill="white" /><ellipse cx="39" cy="30" rx="3.1" ry="3.8" fill="white" /><circle cx="26" cy="31" r="1.8" fill={eye} /><circle cx="39" cy="31" r="1.8" fill={eye} /><path d="M28 39c2.4 2 5.6 2 8 0" fill="none" stroke="#A95E5A" strokeLinecap="round" strokeWidth="1.6" />{glasses && <><rect x="20" y="26" width="12" height="9" rx="3" fill="none" stroke="#3D4658" strokeWidth="1.3" /><rect x="33" y="26" width="12" height="9" rx="3" fill="none" stroke="#3D4658" strokeWidth="1.3" /><path d="M32 30h1" stroke="#3D4658" /></>}{accessory && <path d="M44 16l2 3 3 .5-2 2.3.5 3-2.5-1.4-2.6 1.4.5-3-2-2.3 3-.5z" fill="#F3C765" />}<path d="M19 57c2-9 7-14 13-14s11 5 13 14" fill={seed % 2 ? "#506C92" : "#8B5976"} /></svg>;
}
