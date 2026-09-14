import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import WeekRow from "../ScheduleBuilder/WeekRow";
import type { RaceTimes, Series } from "../../types";

const carRotationSeries: Series = {
  seriesId: 100,
  seriesName: "Ring Meister",
  category: "sports_car",
  licenseClass: "D",
  setupType: "open",
  isMulticlass: false,
  totalWeeks: 2,
  raceTimeMinutes: null,
  isRepeating: true,
  cars: [
    { carId: 1, carName: "BMW M4 GT4" },
    { carId: 2, carName: "Porsche Cayman" },
  ],
  scheduleWeeks: [
    {
      weekNumber: 1, seasonWeek: 1, trackId: 300,
      trackName: "Nürburgring Combined", rainChance: 0, rainEnabled: false,
      cars: [{ carId: 1, carName: "BMW M4 GT4" }],
    },
    {
      weekNumber: 2, seasonWeek: 2, trackId: 300,
      trackName: "Nürburgring Combined", rainChance: 0, rainEnabled: false,
      cars: [{ carId: 2, carName: "Porsche Cayman" }],
    },
  ],
};

const normalSeries: Series = {
  seriesId: 200,
  seriesName: "GT3 Sprint",
  category: "sports_car",
  licenseClass: "C",
  setupType: "open",
  isMulticlass: false,
  totalWeeks: 2,
  raceTimeMinutes: null,
  isRepeating: true,
  cars: [{ carId: 1, carName: "BMW M4 GT3" }],
  scheduleWeeks: [
    { weekNumber: 1, seasonWeek: 1, trackId: 400, trackName: "Spa", rainChance: 0, rainEnabled: false },
    { weekNumber: 2, seasonWeek: 2, trackId: 500, trackName: "Monza", rainChance: 0, rainEnabled: false },
  ],
};

const allSeries = [carRotationSeries, normalSeries];

describe("WeekRow", () => {
  it("shows car name instead of track for car-rotation series", () => {
    render(
      <WeekRow
        week={1}
        isCurrentWeek={false}
        seasonStartDate="2026-03-10T00:00:00.000Z"
        series={allSeries}
        weeklyPicks={{ 1: [carRotationSeries.seriesId] }}
        weeklyMaybes={{}}
      />,
    );
    expect(screen.getByText("BMW M4 GT4")).toBeInTheDocument();
    expect(screen.queryByText("Nürburgring Combined")).not.toBeInTheDocument();
  });

  it("shows track name for normal series", () => {
    render(
      <WeekRow
        week={1}
        isCurrentWeek={false}
        seasonStartDate="2026-03-10T00:00:00.000Z"
        series={allSeries}
        weeklyPicks={{ 1: [normalSeries.seriesId] }}
        weeklyMaybes={{}}
      />,
    );
    expect(screen.getByText("Spa")).toBeInTheDocument();
  });

  it("shows correct car per week for car-rotation series", () => {
    render(
      <WeekRow
        week={2}
        isCurrentWeek={false}
        seasonStartDate="2026-03-10T00:00:00.000Z"
        series={allSeries}
        weeklyPicks={{ 2: [carRotationSeries.seriesId] }}
        weeklyMaybes={{}}
      />,
    );
    expect(screen.getByText("Porsche Cayman")).toBeInTheDocument();
    expect(screen.queryByText("BMW M4 GT4")).not.toBeInTheDocument();
  });

  it("hides add/remove controls when read-only", () => {
    render(
      <WeekRow
        week={1}
        isCurrentWeek={false}
        seasonStartDate="2026-03-10T00:00:00.000Z"
        series={allSeries}
        weeklyPicks={{ 1: [normalSeries.seriesId] }}
        weeklyMaybes={{}}
        readOnly
      />,
    );
    expect(screen.queryByRole("button", { name: /add series/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove series/i })).not.toBeInTheDocument();
  });

  describe("back-2-backs", () => {
    const timedSeries = (seriesId: number, seriesName: string, raceTimes: RaceTimes): Series => ({
      ...normalSeries,
      seriesId,
      seriesName,
      scheduleWeeks: [{ ...normalSeries.scheduleWeeks[0], raceTimes }],
    });
    // Early ends on the quarter hour, exactly when Late starts; not the reverse.
    const early = timedSeries(301, "Early Sprint", {
      kind: "repeating", firstSessionTime: "00:30", repeatMinutes: 60, sessionMinutes: 15,
    });
    const late = timedSeries(302, "Late Sprint", {
      kind: "repeating", firstSessionTime: "00:45", repeatMinutes: 60, sessionMinutes: 15,
    });
    const b2bSeries = [early, late, normalSeries, carRotationSeries];

    function renderWeek(picks: number[], maybes: number[] = [], readOnly = false) {
      render(
        <WeekRow
          week={1}
          isCurrentWeek={false}
          seasonStartDate="2026-03-10T00:00:00.000Z"
          series={b2bSeries}
          weeklyPicks={{ 1: picks }}
          weeklyMaybes={{ 1: maybes }}
          readOnly={readOnly}
        />,
      );
    }

    it("is collapsed by default with the number of qualifying pairs", () => {
      renderWeek([early.seriesId, late.seriesId]);
      const toggle = screen.getByRole("button", { name: "Back-2-backs (1)" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      // The controlled panel exists but stays empty until opened.
      const region = document.getElementById(toggle.getAttribute("aria-controls")!);
      expect(region).not.toBeNull();
      expect(region).not.toBeVisible();
      expect(screen.queryByText("Early Sprint → Late Sprint")).not.toBeInTheDocument();
    });

    it("renders the panel contents again after collapsing and reopening", async () => {
      renderWeek([early.seriesId, late.seriesId]);
      const toggle = screen.getByRole("button", { name: "Back-2-backs (1)" });
      await userEvent.click(toggle);
      expect(screen.getByText("Early Sprint → Late Sprint")).toBeVisible();
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Early Sprint → Late Sprint")).not.toBeInTheDocument();
      await userEvent.click(toggle);
      expect(screen.getByText("Early Sprint → Late Sprint")).toBeVisible();
    });

    it("expands on click to show pairs and series without start times", async () => {
      renderWeek([early.seriesId, late.seriesId], [normalSeries.seriesId]);
      const toggle = screen.getByRole("button", { name: "Back-2-backs (1)" });
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      const region = document.getElementById(toggle.getAttribute("aria-controls")!);
      expect(region).toBeVisible();
      expect(screen.getByText("Early Sprint → Late Sprint")).toBeVisible();
      expect(screen.queryByText("Late Sprint → Early Sprint")).not.toBeInTheDocument();
      expect(screen.getByText("No start times: GT3 Sprint")).toBeVisible();
    });

    it("includes maybes and is shown for read-only seasons", () => {
      renderWeek([early.seriesId], [late.seriesId], true);
      expect(screen.getByRole("button", { name: "Back-2-backs (1)" })).toBeInTheDocument();
    });

    it("says when nothing qualifies", async () => {
      renderWeek([normalSeries.seriesId, carRotationSeries.seriesId]);
      await userEvent.click(screen.getByRole("button", { name: "Back-2-backs (0)" }));
      expect(screen.getByText("No back-2-backs this week")).toBeVisible();
      expect(screen.getByText("No start times: GT3 Sprint, Ring Meister")).toBeVisible();
    });

    it("is not rendered with fewer than two series", () => {
      renderWeek([early.seriesId]);
      expect(screen.queryByRole("button", { name: /back-2-backs/i })).not.toBeInTheDocument();
    });
  });
});
