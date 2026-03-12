import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import ExportImport from "../ExportImport";
import { useAppStore } from "../../store/useAppStore";

describe("ExportImport", () => {
  beforeEach(() => {
    useAppStore.setState({ favorites: [1, 2], weeklyPicks: { 1: [1] } });
  });

  it("renders export and import buttons", () => {
    render(<ExportImport />);
    expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import/i })).toBeInTheDocument();
  });
});
