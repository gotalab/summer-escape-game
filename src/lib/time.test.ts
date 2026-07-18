import { describe, expect, it } from "vitest";
import { dateForJapan, formatJapanDate, timeInJapan } from "./time";

describe("Japan service time", () => {
  const friday = new Date("2026-07-17T14:59:00.000Z"); // 23:59 JST

  it("selects calendar dates in JST, not the browser timezone", () => {
    expect(dateForJapan("today", friday)).toBe("2026-07-17");
    expect(dateForJapan("tomorrow", friday)).toBe("2026-07-18");
    expect(dateForJapan("weekend", friday)).toBe("2026-07-18");
  });

  it("keeps the selected date explicit for the interface", () => {
    expect(formatJapanDate("2026-07-18")).toContain("7/18");
    expect(formatJapanDate("2026-07-18")).toContain("土");
    expect(timeInJapan(friday)).toEqual({ hours: 23, minutes: 59 });
  });
});
