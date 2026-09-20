import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "@/App";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import "@/index.css";

// This phase (customer UI on local fixtures) never touches Firebase — see
// docs/PROGRESS.md: "Do not initialise Firebase merely to display local
// fixtures." lib/firebase/client.ts is untouched, tested infrastructure from
// the foundation phase; a later phase that actually needs Auth/Firestore
// imports and calls connectToEmulatorsIfConfigured() from there, not here.

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found in index.html");

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </BrowserRouter>
  </StrictMode>,
);
