export type VillageRoof = {
  x: number; y: number; base: number; scale: number;
  silhouette: [number, number][];
};
export type VillageScene = { roofs: VillageRoof[] };
