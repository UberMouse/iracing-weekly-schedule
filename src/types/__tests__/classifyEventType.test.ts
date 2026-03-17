import { describe, it, expect } from "vitest";
import { classifyEventType } from "../index";

describe("classifyEventType", () => {
  it("returns sprint when isRepeating is true", () => {
    expect(classifyEventType(null, true)).toBe("sprint");
    expect(classifyEventType(60, true)).toBe("sprint");
    expect(classifyEventType(360, true)).toBe("sprint");
  });

  it("returns endurance when not repeating and raceTimeMinutes is null", () => {
    expect(classifyEventType(null, false)).toBe("endurance");
  });

  it("returns endurance when not repeating and raceTimeMinutes <= 180", () => {
    expect(classifyEventType(60, false)).toBe("endurance");
    expect(classifyEventType(180, false)).toBe("endurance");
  });

  it("returns special when not repeating and raceTimeMinutes > 180", () => {
    expect(classifyEventType(181, false)).toBe("special");
    expect(classifyEventType(360, false)).toBe("special");
  });
});
