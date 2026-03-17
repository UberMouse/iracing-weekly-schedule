import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import EventTypeBadge from "../EventTypeBadge";

describe("EventTypeBadge", () => {
  it("returns null for sprint (isRepeating=true)", () => {
    const { container } = render(<EventTypeBadge raceTimeMinutes={null} isRepeating={true} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Endurance label for endurance events", () => {
    render(<EventTypeBadge raceTimeMinutes={120} isRepeating={false} />);
    expect(screen.getByText("Endurance")).toBeInTheDocument();
  });

  it("renders Special Event label for special events", () => {
    render(<EventTypeBadge raceTimeMinutes={240} isRepeating={false} />);
    expect(screen.getByText("Special Event")).toBeInTheDocument();
  });

  it("renders compact badge with same content", () => {
    render(<EventTypeBadge raceTimeMinutes={120} isRepeating={false} compact />);
    expect(screen.getByText(/Endurance/)).toBeInTheDocument();
    expect(screen.getByText(/2h/)).toBeInTheDocument();
  });

  describe("formatDuration via title attribute", () => {
    it("formats 90min as 1h30m", () => {
      render(<EventTypeBadge raceTimeMinutes={90} isRepeating={false} compact />);
      expect(screen.getByText(/1h30m/)).toBeInTheDocument();
    });

    it("formats 120min as 2h", () => {
      render(<EventTypeBadge raceTimeMinutes={120} isRepeating={false} compact />);
      expect(screen.getByText(/2h/)).toBeInTheDocument();
    });

    it("formats 45min as 45m", () => {
      render(<EventTypeBadge raceTimeMinutes={45} isRepeating={false} compact />);
      expect(screen.getByText(/45m/)).toBeInTheDocument();
    });
  });
});
