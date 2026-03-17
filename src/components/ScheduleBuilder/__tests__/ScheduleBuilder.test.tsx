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
      weeklyMaybes: {},
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

  it("shows maybe series with maybe label", () => {
    const series = useAppStore.getState().series;
    const testSeries = series[0];
    useAppStore.setState({ weeklyMaybes: { 1: [testSeries.seriesId] } });
    render(<ScheduleBuilder />);
    expect(screen.getByText(testSeries.seriesName)).toBeInTheDocument();
    expect(screen.getByText("maybe")).toBeInTheDocument();
  });

  it("can toggle a pick to maybe", async () => {
    const series = useAppStore.getState().series;
    const testSeries = series[0];
    useAppStore.setState({ weeklyPicks: { 1: [testSeries.seriesId] } });
    render(<ScheduleBuilder />);
    const toggleBtn = screen.getByRole("button", { name: /mark as maybe/i });
    await userEvent.click(toggleBtn);
    expect(useAppStore.getState().weeklyPicks[1]).not.toContain(testSeries.seriesId);
    expect(useAppStore.getState().weeklyMaybes[1]).toContain(testSeries.seriesId);
  });

  it("can toggle a maybe back to definite", async () => {
    const series = useAppStore.getState().series;
    const testSeries = series[0];
    useAppStore.setState({ weeklyMaybes: { 1: [testSeries.seriesId] } });
    render(<ScheduleBuilder />);
    const toggleBtn = screen.getByRole("button", { name: /promote to definite/i });
    await userEvent.click(toggleBtn);
    expect(useAppStore.getState().weeklyMaybes[1]).not.toContain(testSeries.seriesId);
    expect(useAppStore.getState().weeklyPicks[1]).toContain(testSeries.seriesId);
  });

  it("can remove a maybe series", async () => {
    const series = useAppStore.getState().series;
    const testSeries = series[0];
    useAppStore.setState({ weeklyMaybes: { 1: [testSeries.seriesId] } });
    render(<ScheduleBuilder />);
    const removeBtn = screen.getByRole("button", { name: /remove/i });
    await userEvent.click(removeBtn);
    expect(useAppStore.getState().weeklyMaybes[1]).not.toContain(testSeries.seriesId);
  });
});
