import { html } from "lit";
import type { AppViewState } from "../../ui/src/ui/app-view-state.ts";

// Renders the fastvistos dashboard as an iframe microfrontend
export function renderFastvistosTab(state: AppViewState) {
  console.debug("Rendering Fastvistos tab", state);
  // You may want to make the URL configurable or dynamic in the future
  const dashboardUrl = "http://localhost:5173/"; // Adjust if needed
  return html`
    <div class="fastvistos-iframe-container" style="height:100%;width:100%;display:flex;align-items:stretch;">
      <iframe
        src="${dashboardUrl}"
        style="border:0;width:100%;height:100%;flex:1;"
        title="Fastvistos Dashboard"
        allowfullscreen
      ></iframe>
    </div>
  `;
}
