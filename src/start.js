import { isPrismatic } from "./product-route.js";
import "./product-tabs.css";

const prism = isPrismatic();
window.addEventListener("hashchange", () => {
  if (prism !== isPrismatic()) location.reload();
});
const nav = document.getElementById("product-types");
nav
  .querySelector(prism ? '[href="#prismatic"]' : '[href="#pouch"]')
  .setAttribute("aria-current", "page");
if (prism)
  import("./prismatic/app.js").then((module) => module.startPrismatic());
else import("./main.js");
