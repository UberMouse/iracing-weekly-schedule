import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import ScheduleBuilder from "../ScheduleBuilder";
import { useAppStore } from "../../../store/useAppStore";
import type { SeasonPicks } from "../../../store/useAppStore";
import type { Series } from "../../../types";

const SEASON_ID = "2026-S2";

const testSeries: Series = {
  seriesId: 42,
  seriesName: "Test Series",
  category: "sports_car",
  licenseClass: "C",
  setupType: "open",
  isMulticlass: false,
  totalWeeks: 12,
  raceTimeMinutes: null,
  isRepeating: true,
  cars: [{ carId: 1, carName: "Test Car" }],
  scheduleWeeks: [
    { weekNumber: 1, seasonWeek: 1, trackId: 1, trackName: "Spa", rainChance: 0, rainEnabled: false },
    { weekNumber: 2, seasonWeek: 2, trackId: 2, trackName: "Monza", rainChance: 0, rainEnabled: false },
  ],
};

function setPicks(picks: SeasonPicks) {
  useAppStore.setState({ seasonPicks: { [SEASON_ID]: picks } });
}

describe("ScheduleBuilder", () => {
  beforeEach(() => {
    useAppStore.setState({
      status: "ready",
      currentSeasonId: SEASON_ID,
      viewingSeasonId: SEASON_ID,
      availableSeasons: [{ id: SEASON_ID, name: "2026 Season 2", startDate: "2026-03-17T00:00:00.000Z" }],
      seasonCache: {
        [SEASON_ID]: {
          seasonId: SEASON_ID,
          seasonName: "2026 Season 2",
          seasonStartDate: "2026-03-17T00:00:00.000Z",
          series: [testSeries],
        },
      },
      seasonPicks: {},
      favorites: [],
    });
  });

  it("renders 12 week rows", () => {
    render(<ScheduleBuilder />);
    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(`Week ${i}`)).toBeInTheDocument();
    }
  });

  it("shows Add Series button for empty weeks", () => {
    render(<ScheduleBuilder />);
    const addButtons = screen.getAllByRole("button", { name: /add series/i });
    expect(addButtons.length).toBe(12);
  });

  it("shows picked series in the correct week", () => {
    setPicks({ weeklyPicks: { 1: [testSeries.seriesId] }, weeklyMaybes: {} });
    render(<ScheduleBuilder />);
    expect(screen.getByText(testSeries.seriesName)).toBeInTheDocument();
  });

  it("can remove a series from a week", async () => {
    setPicks({ weeklyPicks: { 1: [testSeries.seriesId] }, weeklyMaybes: {} });
    render(<ScheduleBuilder />);
    const removeBtn = screen.getByRole("button", { name: /remove/i });
    await userEvent.click(removeBtn);
    expect(useAppStore.getState().seasonPicks[SEASON_ID].weeklyPicks[1]).not.toContain(testSeries.seriesId);
  });

  it("shows maybe series with maybe label", () => {
    setPicks({ weeklyPicks: {}, weeklyMaybes: { 1: [testSeries.seriesId] } });
    render(<ScheduleBuilder />);
    expect(screen.getByText(testSeries.seriesName)).toBeInTheDocument();
    expect(screen.getByText("maybe")).toBeInTheDocument();
  });

  it("can toggle a pick to maybe", async () => {
    setPicks({ weeklyPicks: { 1: [testSeries.seriesId] }, weeklyMaybes: {} });
    render(<ScheduleBuilder />);
    const toggleBtn = screen.getByRole("button", { name: /mark as maybe/i });
    await userEvent.click(toggleBtn);
    const picks = useAppStore.getState().seasonPicks[SEASON_ID];
    expect(picks.weeklyPicks[1]).not.toContain(testSeries.seriesId);
    expect(picks.weeklyMaybes[1]).toContain(testSeries.seriesId);
  });

  it("can toggle a maybe back to definite", async () => {
    setPicks({ weeklyPicks: {}, weeklyMaybes: { 1: [testSeries.seriesId] } });
    render(<ScheduleBuilder />);
    const toggleBtn = screen.getByRole("button", { name: /promote to definite/i });
    await userEvent.click(toggleBtn);
    const picks = useAppStore.getState().seasonPicks[SEASON_ID];
    expect(picks.weeklyMaybes[1]).not.toContain(testSeries.seriesId);
    expect(picks.weeklyPicks[1]).toContain(testSeries.seriesId);
  });

  it("can remove a maybe series", async () => {
    setPicks({ weeklyPicks: {}, weeklyMaybes: { 1: [testSeries.seriesId] } });
    render(<ScheduleBuilder />);
    const removeBtn = screen.getByRole("button", { name: /remove/i });
    await userEvent.click(removeBtn);
    expect(useAppStore.getState().seasonPicks[SEASON_ID].weeklyMaybes[1]).not.toContain(testSeries.seriesId);
  });
});
