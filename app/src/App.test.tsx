import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { App } from "@/App";
import { LocaleProvider } from "@/i18n/LocaleProvider";

function renderApp(initialEntry: string) {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

describe("App routing", () => {
  it("renders the home hero at /", async () => {
    renderApp("/");
    expect(await screen.findByRole("heading", { name: /your screen\. your game\. your celebration\./i })).toBeInTheDocument();
  });

  it("renders the not-found page for an unknown route", async () => {
    renderApp("/does-not-exist");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("renders the packages page", async () => {
    renderApp("/packages");
    expect(await screen.findByRole("heading", { name: "Packages", level: 2 })).toBeInTheDocument();
  });

  it("renders the booking wizard entry step", async () => {
    renderApp("/book");
    expect(await screen.findByRole("heading", { name: "Choose a package" })).toBeInTheDocument();
  });
});
