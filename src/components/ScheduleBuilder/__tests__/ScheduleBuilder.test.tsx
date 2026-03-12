import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import ScheduleBuilder from "../ScheduleBuilder";
import { useAppStore } from "../../../store/useAppStore";

describe("ScheduleBuilder", () => {
  beforeEach(() => {
    useAppStore.setState({
      favorites: [],
      weeklyPicks: {},
    });
  });

  it("renders 12 week columns", () => {
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
    const series = useAppStore.getState().series;
    const testSeries = series[0];
    useAppStore.setState({ weeklyPicks: { 1: [testSeries.seriesId] } });
    render(<ScheduleBuilder />);
    expect(screen.getByText(testSeries.seriesName)).toBeInTheDocument();
  });

  it("can remove a series from a week", async () => {
    const series = useAppStore.getState().series;
    const testSeries = series[0];
    useAppStore.setState({ weeklyPicks: { 1: [testSeries.seriesId] } });
    render(<ScheduleBuilder />);
    const removeBtn = screen.getByRole("button", { name: /remove/i });
    await userEvent.click(removeBtn);
    expect(useAppStore.getState().weeklyPicks[1]).not.toContain(testSeries.seriesId);
  });
});
