import { describe, expect, it } from "vitest";
import { getOrbitAvatar, orbitAvatars } from "./orbitAvatars";

describe("Orbit built-in avatar catalog", () => {
  it("exposes one hundred deterministic non-upload avatar identities", () => {
    expect(orbitAvatars).toHaveLength(100);
    expect(new Set(orbitAvatars.map(avatar => avatar.id)).size).toBe(100);
    expect(orbitAvatars[0].id).toBe("orbit-01");
    expect(orbitAvatars[99].id).toBe("orbit-100");
  });

  it("falls back safely to a built-in avatar for unknown identifiers", () => {
    expect(getOrbitAvatar("external-image-url").id).toBe("orbit-01");
  });
});
