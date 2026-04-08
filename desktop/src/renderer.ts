import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root container");
}

createRoot(container).render(createElement(App));
