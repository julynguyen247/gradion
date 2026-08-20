import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewProjectForm } from "./new-project-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("NewProjectForm", () => {
  it("validates the title and selected book source", () => {
    render(<NewProjectForm />);

    fireEvent.click(screen.getByRole("button", { name: /create project/i }));

    expect(screen.getByText("Give your project a title.")).toBeInTheDocument();
    expect(screen.getByText("Paste the book text to continue.")).toBeInTheDocument();
    expect(screen.getByLabelText("Project title")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Paste book text")).toHaveAttribute("aria-invalid", "true");
  });

  it("supports the standard keyboard interaction for its source tabs", () => {
    render(<NewProjectForm />);
    const pasteTab = screen.getByRole("tab", { name: /paste text/i });

    pasteTab.focus();
    fireEvent.keyDown(pasteTab, { key: "ArrowRight" });

    const uploadTab = screen.getByRole("tab", { name: /upload .txt/i });
    expect(uploadTab).toHaveFocus();
    expect(uploadTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Upload .txt");
    expect(screen.getByLabelText("Book text .txt file")).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(uploadTab, { key: "Home" });
    expect(screen.getByRole("tab", { name: /paste text/i })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Paste text");
  });
});
