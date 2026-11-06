import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Fonts are bundled with the app (no request to Google Fonts: better privacy, works under a strict CSP).
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./styles.css";
import "./editor/editor.css";
import "./gateway.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
