import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, afterEach, vi } from "vitest";
import TrackUsage from "../TrackUsage";
import type { TrackUsageFile } from "../../types";

const file: TrackUsageFile = {
  seasons: [
    { id: "2026-S2", name: "2026 Season 2" },
    { id: "2026-S3", name: "2026 Season 3" },
    { id: "2026-S4", name: "2026 Season 4", provisional: true },
  ],
  tracks: [
    {
      trackName: "Charlotte Motor Speedway",
      counts: {
        oval: { "2026-S2": 4, "2026-S3": 6 },
        road: { "2026-S4": 2 },
      },
    },
    {
      trackName: "Lanier National Speedway",
      counts: {
        dirt_oval: { "2026-S2": 10, "2026-S3": 10 },
      },
    },
    {
      trackName: "Mystery Track",
      counts: {
        unknown: { "2026-S2": 5 },
      },
    },
  ],
};

function mockFetchOnce(response: { ok: boolean; status?: number; json?: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("TrackUsage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a season column per season plus a Total column, and the season totals", async () => {
    mockFetchOnce({ ok: true, json: async () => file });
    render(<TrackUsage />);

    await waitFor(() => expect(screen.getByText("Charlotte Motor Speedway")).toBeInTheDocument());

    expect(screen.getByRole("columnheader", { name: /2026 Season 2/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /2026 Season 3/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /2026 Season 4/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeInTheDocument();

    // Lanier: 10 + 10 = 20 total, all bucket "all" filter (default).
    const lanierRow = screen.getByText("Lanier National Speedway").closest("tr");
    expect(lanierRow).not.toBeNull();
    expect(lanierRow!.textContent).toContain("20");
  });

  it("marks a provisional season", async () => {
    mockFetchOnce({ ok: true, json: async () => file });
    render(<TrackUsage />);
    await waitFor(() => expect(screen.getByText("Charlotte Motor Speedway")).toBeInTheDocument());
    expect(screen.getByText("Provisional")).toBeInTheDocument();
  });

  it("sorts rows by total descending by default", async () => {
    mockFetchOnce({ ok: true, json: async () => file });
    render(<TrackUsage />);
    await waitFor(() => expect(screen.getByText("Charlotte Motor Speedway")).toBeInTheDocument());

    const rows = screen.getAllByRole("row").slice(1); // drop header row
    const names = rows.map((r) => r.querySelector("td")?.textContent);
    // Lanier (20) > Charlotte (12) > Mystery (5)
    expect(names).toEqual(["Lanier National Speedway", "Charlotte Motor Speedway", "Mystery Track"]);
  });

  it("shows a 0 for seasons with no usage rather than a blank cell", async () => {
    mockFetchOnce({ ok: true, json: async () => file });
    render(<TrackUsage />);
    await waitFor(() => expect(screen.getByText("Lanier National Speedway")).toBeInTheDocument());
    const lanierRow = screen.getByText("Lanier National Speedway").closest("tr")!;
    const cells = Array.from(lanierRow.querySelectorAll("td")).map((td) => td.textContent);
    // Track, S2, S3, S4, Total
    expect(cells).toEqual(["Lanier National Speedway", "10", "10", "0", "20"]);
  });

  it("filtering to a single type counts only that bucket, hides zero rows, and re-sorts", async () => {
    mockFetchOnce({ ok: true, json: async () => file });
    render(<TrackUsage />);
    await waitFor(() => expect(screen.getByText("Charlotte Motor Speedway")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Road" }));

    // Only Charlotte has any road-course usage (2, from 2026-S4).
    expect(screen.getByText("Charlotte Motor Speedway")).toBeInTheDocument();
    expect(screen.queryByText("Lanier National Speedway")).not.toBeInTheDocument();
    expect(screen.queryByText("Mystery Track")).not.toBeInTheDocument();

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("2");
  });

  it("'All' includes the unknown bucket", async () => {
    mockFetchOnce({ ok: true, json: async () => file });
    render(<TrackUsage />);
    await waitFor(() => expect(screen.getByText("Mystery Track")).toBeInTheDocument());
    const row = screen.getByText("Mystery Track").closest("tr")!;
    expect(row.textContent).toContain("5");
  });

  it("shows an empty state when the filter matches no tracks", async () => {
    mockFetchOnce({ ok: true, json: async () => file });
    render(<TrackUsage />);
    await waitFor(() => expect(screen.getByText("Charlotte Motor Speedway")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Dirt Road" }));

    expect(screen.getByText(/no tracks match/i)).toBeInTheDocument();
  });

  it("shows an error state with a working retry", async () => {
    mockFetchOnce({ ok: false, status: 500 });
    render(<TrackUsage />);

    await waitFor(() => expect(screen.getByText(/couldn't load track usage/i)).toBeInTheDocument());

    mockFetchOnce({ ok: true, json: async () => file });
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(screen.getByText("Charlotte Motor Speedway")).toBeInTheDocument());
  });
});
