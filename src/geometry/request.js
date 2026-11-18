export function rebuildRequest(project, revision) {
  const requestToken = crypto.randomUUID();
  return {
    requestToken,
    options: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, revision, requestToken }),
    },
  };
}
