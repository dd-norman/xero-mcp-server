import { describe, it, expect } from "vitest";
import { formatTracking } from "../format-tracking.js";

describe("formatTracking", () => {
  it("returns None when there is no tracking", () => {
    expect(formatTracking(undefined)).toBe("None");
    expect(formatTracking([])).toBe("None");
  });

  it("joins multiple categories with their IDs", () => {
    expect(
      formatTracking([
        { name: "Region", option: "East", trackingCategoryID: "cat-1" },
        { name: "Department", option: "Sales", trackingCategoryID: "cat-2" },
      ]),
    ).toBe(
      "Region: East (trackingCategoryID: cat-1); Department: Sales (trackingCategoryID: cat-2)",
    );
  });
});
