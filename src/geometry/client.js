export async function engineHealth() {
  const response = await fetch("/api/health", { cache: "no-store" });
  if (!response.ok) throw Error("CAD 계산 서버에 연결할 수 없습니다.");
  const data = await response.json();
  if (
    data.mode !== "live-cad" ||
    data.schemaVersion !== 3 ||
    !data.capabilities?.includes("rebuild")
  )
    throw Error(
      "실시간 v1.2 CAD 계산 서버가 아닙니다. 고정 메시 프리뷰에서는 치수 편집을 사용할 수 없습니다.",
    );
  return data;
}
export async function rebuild(project, revision) {
  const requestToken = crypto.randomUUID();
  const response = await fetch("/api/rebuild", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, revision, requestToken }),
  });
  const data = await response.json();
  if (!response.ok) throw Error((data.errors || [data.error]).join("\n"));
  if (
    data.mode !== "live-cad" ||
    data.revision !== revision ||
    data.requestToken !== requestToken ||
    data.stage !== project.stage
  )
    throw Error(
      "CAD 응답이 현재 계산 요청과 일치하지 않습니다. 고정 응답/구버전 서버를 확인하세요.",
    );
  return data;
}
export async function exportStep(project) {
  const response = await fetch("/api/step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project }),
  });
  if (!response.ok) {
    const x = await response.json();
    throw Error((x.errors || [x.error]).join("\n"));
  }
  return response.blob();
}
