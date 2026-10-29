import type { EarthView } from "./EarthRenderer";
import { koreaDateInput, parseKoreaDate, SUWON, type SkyState } from "./celestial";
import styles from "../openSourceStudy.module.css";
import skyStyles from "./earthSky.module.css";

export default function RealTimeControls({view,sky,clock,apply}: {view: EarthView; sky: SkyState; clock: number; apply: (patch: Partial<EarthView>) => void}) {
  const lookAt = (body: {azimuth:number;altitude:number}) => apply({yaw:body.azimuth*Math.PI/180,pitch:Math.max(-1.3,Math.min(1.55,body.altitude*Math.PI/180))});
  const elevationMeters = view.altitude*1000;
  const elevationLabel = elevationMeters < 1000 ? `${Math.round(elevationMeters).toLocaleString("ko-KR")} m` : `${view.altitude.toFixed(2)} km`;
  return <section className={skyStyles.info} aria-label="실시간 관측 정보">
    <p>{view.latitude === SUWON.latitude && view.longitude === SUWON.longitude ? "대한민국 수원" : "사용자 관측 위치"} · 해발 {elevationLabel}<br />{view.observationTime === null ? "현재 시간 동기화" : "날짜 미리보기"}</p>
    <time dateTime={sky.date.toISOString()}>{new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"medium",timeStyle:"medium",hour12:false}).format(sky.date)} KST</time>
    <div className={skyStyles.coordinates}>
      <label>위도 °<input aria-label="Latitude" className={skyStyles.field} type="number" min="-90" max="90" step="0.0001" value={view.latitude} onChange={event => { if(event.target.value)apply({latitude:Math.max(-90,Math.min(90,Number(event.target.value)))}); }} /></label>
      <label>경도 °<input aria-label="Longitude" className={skyStyles.field} type="number" min="-180" max="180" step="0.0001" value={view.longitude} onChange={event => { if(event.target.value)apply({longitude:Math.max(-180,Math.min(180,Number(event.target.value)))}); }} /></label>
    </div>
    <label>관측 고도 (해발)<output>{elevationLabel}</output><input aria-label="Observer altitude" type="range" min="0" max="1" step="0.001" value={Math.log1p(elevationMeters)/Math.log1p(100000)} onChange={event => apply({altitude:Math.expm1(Number(event.target.value)*Math.log1p(100000))/1000})} /></label>
    <label>날짜·시간 (한국 표준시)<input className={skyStyles.field} aria-label="Observation date KST" type="datetime-local" min="1900-01-01T00:00" max="2100-12-31T23:59" value={koreaDateInput(view.observationTime ?? clock)} onChange={event => { const timestamp=parseKoreaDate(event.target.value); if(timestamp!==null)apply({observationTime:timestamp}); }} /></label>
    <div className={styles.modeRow}><button type="button" onClick={() => apply({observationTime:null})}>지금</button><button type="button" aria-pressed={view.constellations} onClick={() => apply({constellations:!view.constellations})}>별자리 선</button><button type="button" onClick={() => apply({latitude:SUWON.latitude,longitude:SUWON.longitude})}>수원</button></div>
    <dl><dt>태양 고도 / 방위각</dt><dd>{sky.sun.altitude.toFixed(1)}° / {sky.sun.azimuth.toFixed(1)}°</dd><dt>달 고도 / 방위각</dt><dd>{sky.moon.altitude.toFixed(1)}° / {sky.moon.azimuth.toFixed(1)}°</dd><dt>달의 밝은 면</dt><dd>{(sky.moonFraction*100).toFixed(1)}%</dd><dt>달까지 거리</dt><dd>{Math.round(sky.moonDistance).toLocaleString("ko-KR")} km</dd><dt>지구–태양 거리</dt><dd>{sky.earthDistance.toFixed(6)} AU</dd></dl>
    <details><summary>태양계에서 지구의 위치</summary><p>황경 {sky.earthLongitude.toFixed(3)}°<br />태양 중심 황도 좌표 (AU)<br />X {sky.earthPosition[0].toFixed(6)}<br />Y {sky.earthPosition[1].toFixed(6)}<br />Z {sky.earthPosition[2].toFixed(6)}</p></details>
    <div className={styles.modeRow}><button type="button" onClick={() => lookAt(sky.sun)}>태양 보기</button><button type="button" onClick={() => lookAt(sky.moon)}>달 보기</button></div>
    <p>방위각: 북 0° · 동 90° · 남 180° · 서 270°<br />지평선 아래 천체는 보이지 않습니다. 구름은 실제 날씨와 무관한 시뮬레이션입니다.</p>
    <p><a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener noreferrer">Astronomy Engine · MIT</a> · <a href="/earth/LICENSE-d3-celestial" target="_blank" rel="noopener noreferrer">별·별자리: d3-celestial · BSD</a></p>
  </section>;
}
