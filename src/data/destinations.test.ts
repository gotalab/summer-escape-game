import { describe, expect, it } from "vitest";
import { destinations } from "./destinations";
import { destinationCategories } from "./types";

describe("destination catalog", () => {
	it("has enough real choices for discovery", () => {
		expect(destinations.length).toBeGreaterThanOrEqual(100);
	});

	it("uses unique stable IDs", () => {
		const ids = destinations.map(({ id }) => id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("contains valid Japanese coordinates, categories, and public tourism URLs", () => {
		for (const destination of destinations) {
			expect(destination.name).not.toHaveLength(0);
			expect(destination.station).not.toHaveLength(0);
			expect(destination.latitude).toBeGreaterThanOrEqual(24);
			expect(destination.latitude).toBeLessThanOrEqual(46);
			expect(destination.longitude).toBeGreaterThanOrEqual(122);
			expect(destination.longitude).toBeLessThanOrEqual(146);
			expect(destination.categories.length).toBeGreaterThan(0);
			expect(destination.categories.every((category) => destinationCategories.includes(category))).toBe(true);
			expect(() => new URL(destination.tourismUrl)).not.toThrow();
			expect(new URL(destination.tourismUrl).protocol).toBe("https:");
		}
	});
});
