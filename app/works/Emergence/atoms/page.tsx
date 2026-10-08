import { readdir } from "node:fs/promises";
import path from "node:path";
import EmergenceExperience from "../EmergenceExperience";

export default async function AtomsPage() {
  const directory = path.join(process.cwd(), "public", "sounds", "MUSIC");
  const files = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const musicTracks = files
    .filter(file => file.isFile() && /\.(mp3|m4a|ogg|wav|aac|flac|webm)$/i.test(file.name))
    .map(file => ({
      name: file.name.replace(/\.[^.]+$/, ""),
      url: `/sounds/MUSIC/${encodeURIComponent(file.name)}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return <EmergenceExperience musicTracks={musicTracks} />;
}
