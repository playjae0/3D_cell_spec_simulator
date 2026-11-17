export async function rebuild(project,revision){
  const response=await fetch('/api/rebuild',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project,revision})});
  const data=await response.json();if(!response.ok)throw Error((data.errors||[data.error]).join('\n'));return data;
}
export async function exportStep(project){
  const response=await fetch('/api/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project})});
  if(!response.ok){const x=await response.json();throw Error((x.errors||[x.error]).join('\n'));}return response.blob();
}
