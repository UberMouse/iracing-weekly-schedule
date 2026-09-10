import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProvisionalBanner from "../ProvisionalBanner";
import { useAppStore } from "../../store/useAppStore";

const seasons = [
  { id: "2026-S3", name: "2026 Season 3", startDate: "2026-06-16T00:00:00.000Z" },
  { id: "2026-S4", name: "2026 Season 4", startDate: "2026-09-15T00:00:00.000Z", provisional: true },
];

beforeEach(() => {
  useAppStore.setState({ availableSeasons: seasons, viewingSeasonId: "2026-S4" });
});

describe("ProvisionalBanner", () => {
  it("names the season when its schedule is preliminary", () => {
    render(<ProvisionalBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("2026 Season 4 is preliminary.");
  });

  it("stays hidden for an official season", () => {
    useAppStore.setState({ viewingSeasonId: "2026-S3" });
    render(<ProvisionalBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("can be dismissed", async () => {
    render(<ProvisionalBanner />);
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
