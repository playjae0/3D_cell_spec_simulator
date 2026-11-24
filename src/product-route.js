export const isPrismatic = () => location.hash === "#prismatic";
const transferKey = "cell-studio.open-product";

export function switchFile(project, type) {
  sessionStorage.removeItem(transferKey + ".tab");
  sessionStorage.setItem(transferKey, JSON.stringify(project));
  location.hash = type;
}

export function takeFile() {
  const text = sessionStorage.getItem(transferKey);
  sessionStorage.removeItem(transferKey);
  return text && JSON.parse(text);
}

// Keep confirmed designs when following the product tabs within this browser tab.
// Direct links and newly opened tabs continue to start with the public example.
export function rememberProduct(type, getProject) {
  const key = (name) => "cell-studio.product." + name;
  document
    .getElementById("product-types")
    .addEventListener("click", (event) => {
      const target = event.target.closest("a");
      if (
        !target ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const next = target.hash.slice(1);
      if (next === type) return;
      const project = getProject();
      if (project) sessionStorage.setItem(key(type), JSON.stringify(project));
      const previous = sessionStorage.getItem(key(next));
      if (previous) {
        sessionStorage.setItem(transferKey, previous);
        sessionStorage.setItem(transferKey + ".tab", "1");
      }
    });
}

export function tabReturn() {
  const value = sessionStorage.getItem(transferKey + ".tab");
  sessionStorage.removeItem(transferKey + ".tab");
  return value === "1";
}
