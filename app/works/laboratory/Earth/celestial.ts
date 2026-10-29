import { Body, Equator, Ecliptic, HelioVector, Illumination, MakeTime, Observer, RotateVector, Rotation_EQJ_HOR, Rotation_HOR_EQJ, Vector } from "astronomy-engine";

export const SUWON = { latitude: 37.2636, longitude: 127.0286, elevation: 40 };
export const AU_KM = 149597870.7;
const degrees = 180 / Math.PI;
export type Direction = [number, number, number];
function direction(vector: Vector): Direction {
  const length = Math.hypot(vector.x,vector.y,vector.z);
  // Astronomy Engine horizontal frame is north/west/up. Earth uses east/north/up.
  return [-vector.y/length,vector.x/length,vector.z/length];
}
function angles(vector: Direction) {
  return { altitude: Math.asin(vector[2])*degrees, azimuth: (Math.atan2(vector[0],vector[1])*degrees+360)%360 };
}

export function calculateSky(date: Date, latitude = SUWON.latitude, longitude = SUWON.longitude) {
  const time = MakeTime(date);
  const observer = new Observer(latitude,longitude,SUWON.elevation);
  const horizontal = Rotation_EQJ_HOR(time,observer);
  const equatorial = Rotation_HOR_EQJ(time,observer);
  const sun = Equator(Body.Sun,time,observer,false,true);
  const moon = Equator(Body.Moon,time,observer,false,true);
  const sunDirection = direction(RotateVector(horizontal,sun.vec));
  const moonDirection = direction(RotateVector(horizontal,moon.vec));
  const moonToSun = sunDirection.map((value,index) => value*sun.dist-moonDirection[index]*moon.dist);
  const moonSunDirection = moonToSun.map(value => value/Math.hypot(...moonToSun)) as Direction;
  const earth = HelioVector(Body.Earth,time);
  const ecliptic = Ecliptic(earth);
  const distance = Math.hypot(earth.x,earth.y,earth.z);
  const basis = [[0,-1,0],[1,0,0],[0,0,1]].map(([x,y,z]) => RotateVector(equatorial,new Vector(x,y,z,time)));
  return {
    date, sunDirection, moonDirection, moonSunDirection,
    sun: angles(sunDirection), moon: angles(moonDirection),
    moonFraction: Illumination(Body.Moon,time).phase_fraction,
    moonDistance: moon.dist*AU_KM,
    moonRadius: Math.asin(1737.4/(moon.dist*AU_KM)),
    sunRadius: Math.asin(695700/(sun.dist*AU_KM)),
    solarScale: 1/(distance*distance),
    earthDistance: distance, earthLongitude: ecliptic.elon,
    earthPosition: [ecliptic.vec.x,ecliptic.vec.y,ecliptic.vec.z] as Direction,
    // Column-major matrix: local east/north/up -> J2000 equatorial frame.
    localToEquatorial: basis.flatMap(v => [v.x,v.y,v.z]),
  };
}
export type SkyState = ReturnType<typeof calculateSky>;

export function koreaDateInput(timestamp: number) {
  return new Date(timestamp+9*3600000).toISOString().slice(0,16);
}
export function parseKoreaDate(value: string): number | null {
  const date = new Date(`${value}+09:00`);
  const year = date.getUTCFullYear();
  return Number.isFinite(date.getTime()) && year >= 1900 && year <= 2100 ? date.getTime() : null;
}
