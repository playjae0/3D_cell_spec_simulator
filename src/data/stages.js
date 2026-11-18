import contract from "./stages.json" with { type: "json" };
export { contract as stageContract };
export const stageIds = Object.keys(contract);
export const newPouchStages = stageIds.filter((s) => contract[s].pouch);
export const assemblyStage = (s) => contract[s]?.assembly;
const ranks = {
  stacked: 0,
  gathered: 1,
  preweld: 2,
  welded: 3,
  assembly: 4,
  packaged: 5,
  finished: 6,
};
export const assemblyRank = (s) => ranks[s] ?? ranks[assemblyStage(s)] ?? -1;

export function canReviewStage(product, stage) {
  const definition = contract[stage];
  if (!definition) return false;
  const hasTabProfile = Object.values(product.processTooling?.sealBars || {}).some(bar => bar.tabProfile);
  return !hasTabProfile || definition.r4 || !(definition.pouch || definition.legacyPouch);
}
