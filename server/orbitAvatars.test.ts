import { describe, expect, it } from "vitest";
import { getOrbitAvatar, orbitAvatars } from "../client/src/lib/orbitAvatars";

describe("Orbit built-in anime avatar catalog", () => {
  it("exposes one hundred deterministic non-upload avatar identities", () => {
    expect(orbitAvatars).toHaveLength(100);
    expect(new Set(orbitAvatars.map(avatar => avatar.id)).size).toBe(100);
    expect(orbitAvatars[0].id).toBe("orbit-01");
    expect(orbitAvatars[99].id).toBe("orbit-100");
  });

  it("falls back to a built-in avatar for an unsupported external-image identifier", () => {
    expect(getOrbitAvatar("https://example.test/avatar.png").id).toBe("orbit-01");
  });
});
