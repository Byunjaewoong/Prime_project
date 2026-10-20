import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;

function configuration() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

function unavailable() {
  return NextResponse.json({ error: "Supabase 연결 설정이 필요합니다." }, { status: 503 });
}

function isStroke(value: unknown): value is { stroke_key: string; color: string; width: number; points: [number, number][] } {
  if (!value || typeof value !== "object") return false;
  const stroke = value as Record<string, unknown>;
  return typeof stroke.stroke_key === "string" && UUID.test(stroke.stroke_key)
    && typeof stroke.color === "string" && COLOR.test(stroke.color)
    && typeof stroke.width === "number" && Number.isFinite(stroke.width) && stroke.width >= 1 && stroke.width <= 16
    && Array.isArray(stroke.points) && stroke.points.length >= 1 && stroke.points.length <= 600
    && stroke.points.every(point => Array.isArray(point) && point.length === 2
      && point.every(coordinate => typeof coordinate === "number" && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1));
}

export async function GET(request: NextRequest) {
  const config = configuration();
  if (!config) return unavailable();

  const rawAfter = request.nextUrl.searchParams.get("after") ?? "0";
  if (!/^\d{1,16}$/.test(rawAfter)) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  const params = new URLSearchParams({
    select: "id,stroke_key,color,width,points",
    order: "id.asc",
    limit: String(PAGE_SIZE),
    id: `gt.${rawAfter}`,
  });
  try {
    const response = await fetch(`${config.url}/rest/v1/dashboard_strokes?${params}`, {
      headers: { apikey: config.key },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Supabase GET ${response.status}`);
    const strokes = await response.json();
    if (!Array.isArray(strokes)) throw new Error("Invalid Supabase response");
    return NextResponse.json({ strokes, hasMore: strokes.length === PAGE_SIZE }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Dashboard stroke load failed", error);
    return NextResponse.json({ error: "그림을 불러오지 못했습니다." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const config = configuration();
  if (!config) return unavailable();
  const bodyText = await request.text();
  if (bodyText.length > 40000) return NextResponse.json({ error: "Stroke too large" }, { status: 413 });
  let stroke: unknown;
  try { stroke = JSON.parse(bodyText); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!isStroke(stroke)) return NextResponse.json({ error: "Invalid stroke" }, { status: 400 });

  try {
    const response = await fetch(`${config.url}/rest/v1/dashboard_strokes?on_conflict=stroke_key`, {
      method: "POST",
      headers: {
        apikey: config.key,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(stroke),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Supabase POST ${response.status}`);
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("Dashboard stroke save failed", error);
    return NextResponse.json({ error: "선을 저장하지 못했습니다." }, { status: 502 });
  }
}
