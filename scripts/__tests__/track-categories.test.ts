import { describe, it, expect } from "vitest";
import {
  buildTrackCategoryCatalogue,
  mergeTrackCategoryCatalogues,
  type TrackCategoryCatalogue,
} from "../track-categories";

describe("buildTrackCategoryCatalogue", () => {
  it("keys entries by track_id and carries name/config for readability", () => {
    const catalogue = buildTrackCategoryCatalogue([
      { track_id: 355, track_name: "Lime Rock Park", config_name: "West Bend Chicane", category: "road" },
      { track_id: 9, track_name: "USA International Speedway", category: "oval" },
    ]);

    expect(catalogue).toEqual({
      "355": { category: "road", name: "Lime Rock Park", config: "West Bend Chicane" },
      "9": { category: "oval", name: "USA International Speedway" },
    });
  });

  it("skips a layout with an unrecognised category rather than throwing", () => {
    const catalogue = buildTrackCategoryCatalogue([
      { track_id: 1, track_name: "Weird Track", category: "space" },
    ]);
    expect(catalogue).toEqual({});
  });

  it("skips a layout with no category", () => {
    const catalogue = buildTrackCategoryCatalogue([{ track_id: 1, track_name: "No Category" }]);
    expect(catalogue).toEqual({});
  });
});

describe("mergeTrackCategoryCatalogues", () => {
  it("never drops an id only present in the existing catalogue", () => {
    const existing: TrackCategoryCatalogue = {
      "18": { category: "road", name: "[Retired] Road America" },
    };
    const fresh: TrackCategoryCatalogue = {
      "355": { category: "road", name: "Lime Rock Park" },
    };

    const merged = mergeTrackCategoryCatalogues(existing, fresh);
    expect(merged).toEqual({
      "18": { category: "road", name: "[Retired] Road America" },
      "355": { category: "road", name: "Lime Rock Park" },
    });
  });

  it("lets fresh data win on a conflicting id", () => {
    const existing: TrackCategoryCatalogue = { "1": { category: "road", name: "Old Name" } };
    const fresh: TrackCategoryCatalogue = { "1": { category: "road", name: "New Name" } };

    expect(mergeTrackCategoryCatalogues(existing, fresh)).toEqual({
      "1": { category: "road", name: "New Name" },
    });
  });
});
