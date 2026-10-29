type Coordinate = [number, number];
type Stars = { features: { properties: { mag: number; bv: string }; geometry: { coordinates: Coordinate } }[] };
type Constellations = { features: { geometry: { coordinates: Coordinate[][] } }[] };
const TAU = Math.PI*2;

// J2000 star positions/magnitudes and constellation figures from d3-celestial.
// RGB stores stars; alpha stores optional constellation lines, keeping one texture.
export async function createStarTexture(gl: WebGL2RenderingContext, signal: AbortSignal) {
  const data = await Promise.all(["stars.6.json","constellations.lines.json"].map(async file => {
    const response = await fetch(`/earth/${file}`,{signal});
    if (!response.ok) throw new Error(`별 데이터 로딩 실패: ${file}`);
    return response.json();
  }));
  if (signal.aborted) return null;
  const width = Math.min(window.innerWidth < 600 ? 2048 : 4096,gl.getParameter(gl.MAX_TEXTURE_SIZE)), height = width/2;
  const canvas = document.createElement("canvas"); canvas.width=width; canvas.height=height;
  const ctx = canvas.getContext("2d",{willReadFrequently:true});
  if (!ctx) throw new Error("별 지도 생성 실패");
  const position = ([ra,dec]: Coordinate) => [((ra+360)%360)/360*width,(90-dec)/180*height];
  ctx.fillStyle="black"; ctx.fillRect(0,0,width,height);
  for (const star of (data[0] as Stars).features) {
    const [x,y] = position(star.geometry.coordinates);
    const mag = star.properties.mag, bv = Number(star.properties.bv) || 0;
    const brightness = Math.min(1,Math.pow(10,-0.22*(mag+1.5)));
    const radius = (mag<1 ? 2.2 : mag<3 ? 1.5 : 1)*width/4096;
    const red = bv<0 ? 0.72 : 1, green = bv>1 ? 0.78 : 0.94, blue = bv>0.6 ? 0.65 : 1;
    ctx.fillStyle=`rgb(${255*brightness*red},${255*brightness*green},${255*brightness*blue})`;
    for (const offset of [-width,0,width]) { ctx.beginPath(); ctx.arc(x+offset,y,radius,0,TAU); ctx.fill(); }
  }
  const pixels = ctx.getImageData(0,0,width,height);
  ctx.fillStyle="black"; ctx.fillRect(0,0,width,height);
  ctx.strokeStyle="white"; ctx.lineWidth=0.7*width/4096;
  const vector = ([ra,dec]: Coordinate) => { const a=ra*Math.PI/180,d=dec*Math.PI/180; return [Math.cos(d)*Math.cos(a),Math.cos(d)*Math.sin(a),Math.sin(d)]; };
  for (const feature of (data[1] as Constellations).features) for (const line of feature.geometry.coordinates) {
    for (let i=1;i<line.length;i++) {
      const a=vector(line[i-1]), b=vector(line[i]);
      let previous=position(line[i-1]);
      for (let step=1;step<=24;step++) {
        const t=step/24, v=a.map((x,j)=>x*(1-t)+b[j]*t), length=Math.hypot(...v);
        const point=position([Math.atan2(v[1],v[0])*180/Math.PI,Math.asin(v[2]/length)*180/Math.PI]);
        let x=point[0]; if(x-previous[0]>width/2)x-=width; if(x-previous[0]<-width/2)x+=width;
        for(const offset of [-width,0,width]) { ctx.beginPath();ctx.moveTo(previous[0]+offset,previous[1]);ctx.lineTo(x+offset,point[1]);ctx.stroke(); }
        previous=point;
      }
    }
  }
  const lines=ctx.getImageData(0,0,width,height).data;
  for(let i=0;i<pixels.data.length;i+=4) pixels.data[i+3]=lines[i];
  const texture=gl.createTexture();
  if(!texture)throw new Error("별 지도 텍스처 생성 실패");
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels.data);
  canvas.width=1; canvas.height=1;
  return texture;
}
