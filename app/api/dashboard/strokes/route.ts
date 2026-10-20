import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const DEFAULT_SUPABASE_URL = "https://jmmypojyjwkhnzquzfvi.supabase.co";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;

function configuration() {
  const url = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

function unavailable() {
  return NextResponse.json({ error: "Supabase 연결 설정이 필요합니다." }, { status: 503 });
}

function isStroke(value: unknown): value is { stroke_key: string; color: string; width: number; points: [number, number][]; generation: number } {
  if (!value || typeof value !== "object") return false;
  const stroke = value as Record<string, unknown>;
  return typeof stroke.stroke_key === "string" && UUID.test(stroke.stroke_key)
    && typeof stroke.generation === "number" && Number.isSafeInteger(stroke.generation) && stroke.generation >= 0
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
  try {
    const boardResponse = await fetch(`${config.url}/rest/v1/dashboard_board?select=generation&id=eq.1`, {
      headers: { apikey: config.key }, cache: "no-store",
    });
    if (!boardResponse.ok && boardResponse.status !== 404) throw new Error(`Supabase board GET ${boardResponse.status}`);
    const board = boardResponse.ok ? await boardResponse.json() as { generation: number }[] : null;
    if (board && (!Array.isArray(board) || !Number.isSafeInteger(board[0]?.generation))) throw new Error("Missing dashboard board row");
    const generation = board?.[0].generation ?? 0;
    const params = new URLSearchParams({
      select: board ? "id,stroke_key,color,width,points,generation" : "id,stroke_key,color,width,points",
      order: "id.asc",
      limit: String(PAGE_SIZE),
      id: `gt.${rawAfter}`,
    });
    if (board) params.set("generation", `eq.${generation}`);
    const response = await fetch(`${config.url}/rest/v1/dashboard_strokes?${params}`, {
      headers: { apikey: config.key },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Supabase GET ${response.status}`);
    const strokes = await response.json();
    if (!Array.isArray(strokes)) throw new Error("Invalid Supabase response");
    return NextResponse.json({ generation, strokes, hasMore: strokes.length === PAGE_SIZE }, { headers: { "Cache-Control": "no-store" } });
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
    const save = (payload: object) => fetch(`${config.url}/rest/v1/dashboard_strokes?on_conflict=stroke_key`, {
      method: "POST",
      headers: { apikey: config.key, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(payload), cache: "no-store",
    });
    let response = await save(stroke);
    if (response.status === 400 && stroke.generation === 0) {
      const error = await response.clone().json().catch(() => null) as { code?: string } | null;
      if (error?.code === "PGRST204") {
        const legacyStroke = { stroke_key: stroke.stroke_key, color: stroke.color, width: stroke.width, points: stroke.points };
        response = await save(legacyStroke);
      }
    }
    if (response.status === 401 || response.status === 403) {
      const failure = await response.clone().json().catch(() => null) as { code?: string } | null;
      if (failure?.code === "42501") {
        return NextResponse.json({ error: "보드가 초기화되어 이전 선을 저장할 수 없습니다." }, { status: 409 });
      }
    }
    if (!response.ok) throw new Error(`Supabase POST ${response.status}`);
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("Dashboard stroke save failed", error);
    return NextResponse.json({ error: "선을 저장하지 못했습니다." }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const config = configuration();
  if (!config) return unavailable();
  const bodyText = await request.text();
  if (bodyText.length > 200) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  let body: unknown;
  try { body = JSON.parse(bodyText); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const password = (body && typeof body === "object" && "password" in body) ? body.password : null;
  if (typeof password !== "string" || !/^\d{4}$/.test(password)) {
    return NextResponse.json({ error: "비밀번호 네 자리를 입력하세요." }, { status: 400 });
  }
  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/dashboard_clear`, {
      method: "POST",
      headers: { apikey: config.key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_password: password }),
      cache: "no-store",
    });
    if (response.status === 404) return NextResponse.json({ error: "Supabase에 삭제 기능 SQL을 먼저 적용하세요." }, { status: 503 });
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { code?: string; message?: string } | null;
      console.error("Dashboard clear RPC failed", { status: response.status, code: failure?.code, message: failure?.message });
      return NextResponse.json({
        error: `전체 삭제에 실패했습니다. 서버 오류 ${response.status}${failure?.code ? ` / ${failure.code}` : ""}`,
      }, { status: 502 });
    }
    const result = await response.json() as { ok?: boolean; generation?: number; error?: string };
    if (!result.ok) return NextResponse.json({ error: result.error === "locked" ? "잠시 후 다시 시도하세요." : "비밀번호가 다릅니다." },
      { status: result.error === "locked" ? 429 : 401 });
    if (!Number.isSafeInteger(result.generation)) {
      console.error("Dashboard clear RPC returned no generation", result);
      return NextResponse.json({ error: "삭제 응답에 보드 버전이 없습니다." }, { status: 502 });
    }
    return NextResponse.json({ generation: result.generation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Dashboard clear failed", error);
    return NextResponse.json({ error: "전체 삭제에 실패했습니다." }, { status: 502 });
  }
}
