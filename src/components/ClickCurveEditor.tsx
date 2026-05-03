import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
// SAMPLES no longer needed — using direct cubic Bezier path
import "./ClickCurveEditor.css";

interface Props {
  cps: number;
  duty: number;
  jitter: number;
  dutyMin?: number;
  dutyMax?: number;
  jitterMin?: number;
  jitterMax?: number;
  onDutyChange: (next: number) => void;
  onJitterChange: (next: number) => void;
}

const W = 540;
const H = 220;
const PAD_X = 28;
const PAD_Y = 18;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

type DragMode = null | "duty" | "jitter";

export default function ClickCurveEditor({
  cps,
  duty,
  jitter,
  dutyMin = 0,
  dutyMax = 100,
  jitterMin = 0,
  jitterMax = 100,
  onDutyChange,
  onJitterChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragMode>(null);

  const innerW = W - 2 * PAD_X;
  const innerH = H - 2 * PAD_Y;
  const midY = H / 2;
  const midX = W / 2;

  const dutyFraction = clamp(duty, 0, 100) / 100;
  const jitterFraction = clamp(jitter, 0, 100) / 100;

  // Bezier control points:
  // duty handle is the horizontal control on the X axis baseline.
  // jitter handle is the vertical control on the Y axis at center.
  const dutyX = PAD_X + dutyFraction * innerW;
  const dutyY = midY;
  const jitterX = midX;
  const jitterY = midY - jitterFraction * (innerH / 2);

  // Cubic Bezier: M start C cp1 cp2 end
  // start = left edge on X axis, end = right edge on X axis
  // cp1 = duty point (horizontal control)
  // cp2 = jitter point (vertical control)
  const path = useMemo(() => {
    const startX = PAD_X;
    const startY = midY;
    const endX = W - PAD_X;
    const endY = midY;
    return (
      `M ${startX} ${startY} ` +
      `C ${dutyX.toFixed(2)} ${dutyY.toFixed(2)}, ` +
      `${jitterX.toFixed(2)} ${jitterY.toFixed(2)}, ` +
      `${endX} ${endY}`
    );
  }, [dutyX, dutyY, jitterX, jitterY, midY]);

  const cycleMs = cps > 0 ? 1000 / cps : 0;

  const localFromEvent = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    return { x, y };
  };

  const distSq = (x: number, y: number, hx: number, hy: number) =>
    (x - hx) * (x - hx) + (y - hy) * (y - hy);

  const handlePointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const { x, y } = localFromEvent(e);
    const dD = distSq(x, y, dutyX, dutyY);
    const dJ = distSq(x, y, jitterX, jitterY);
    if (dD < dJ && dD < 60 * 60) {
      setDrag("duty");
      svgRef.current?.setPointerCapture(e.pointerId);
      moveDuty(x);
    } else if (dJ < 60 * 60) {
      setDrag("jitter");
      svgRef.current?.setPointerCapture(e.pointerId);
      moveJitter(y);
    }
  };

  const moveDuty = (x: number) => {
    // Duty: t = horizontal position normalized to 0..1, clamp at canvas edges.
    const t = clamp((x - PAD_X) / innerW, 0, 1);
    const pct = Math.round(t * 100);
    onDutyChange(clamp(pct, dutyMin, dutyMax));
  };

  const moveJitter = (y: number) => {
    // Jitter: distance above midline normalized to 0..1.
    // Below midline = 0%. Above by half-height = 100%.
    const above = midY - y;
    const t = clamp(above / (innerH / 2), 0, 1);
    const pct = Math.round(t * 100);
    onJitterChange(clamp(pct, jitterMin, jitterMax));
  };

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const pt = localFromEvent(e);
    if (drag === "duty") moveDuty(pt.x);
    else if (drag === "jitter") moveJitter(pt.y);
  };

  const handlePointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (drag) {
      svgRef.current?.releasePointerCapture(e.pointerId);
      setDrag(null);
    }
  };

  useEffect(() => {
    return () => setDrag(null);
  }, []);

  // Grid lines — 12 vertical, 6 horizontal.
  const vLines: number[] = [];
  for (let i = 1; i < 12; i++) vLines.push(PAD_X + (i / 12) * innerW);
  const hLines: number[] = [];
  for (let i = 1; i < 6; i++) hLines.push(PAD_Y + (i / 6) * innerH);

  return (
    <div className="curve-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="curve-editor"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Grid lines */}
        {vLines.map((x) => (
          <line
            key={`v${x}`}
            className="curve-grid"
            x1={x}
            y1={PAD_Y}
            x2={x}
            y2={H - PAD_Y}
          />
        ))}
        {hLines.map((y) => (
          <line
            key={`h${y}`}
            className="curve-grid"
            x1={PAD_X}
            y1={y}
            x2={W - PAD_X}
            y2={y}
          />
        ))}

        {/* Boundary dashed verticals */}
        <line
          className="curve-bound"
          x1={PAD_X}
          y1={PAD_Y}
          x2={PAD_X}
          y2={H - PAD_Y}
        />
        <line
          className="curve-bound"
          x1={W - PAD_X}
          y1={PAD_Y}
          x2={W - PAD_X}
          y2={H - PAD_Y}
        />

        {/* Axes */}
        <line
          className="curve-axis"
          x1={PAD_X / 2}
          y1={midY}
          x2={W - PAD_X / 2}
          y2={midY}
          markerStart="url(#arrow)"
          markerEnd="url(#arrow)"
        />
        <line
          className="curve-axis"
          x1={midX}
          y1={PAD_Y / 2}
          x2={midX}
          y2={H - PAD_Y / 2}
          markerStart="url(#arrow)"
          markerEnd="url(#arrow)"
        />

        {/* Axis ticks (small lines) */}
        {vLines.map((x) => (
          <line
            key={`tx${x}`}
            className="curve-tick"
            x1={x}
            y1={midY - 3}
            x2={x}
            y2={midY + 3}
          />
        ))}
        {hLines.map((y) => (
          <line
            key={`ty${y}`}
            className="curve-tick"
            x1={midX - 3}
            y1={y}
            x2={midX + 3}
            y2={y}
          />
        ))}

        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 Z" fill="currentColor" />
          </marker>
        </defs>

        {/* The curve */}
        <path className="curve-stroke" d={path} />

        {/* Duty handle (red) */}
        <circle
          className={`curve-handle curve-handle-duty ${drag === "duty" ? "active" : ""}`}
          cx={dutyX}
          cy={dutyY}
          r="7"
        />
        {/* Jitter handle (gold) */}
        <circle
          className={`curve-handle curve-handle-jitter ${drag === "jitter" ? "active" : ""}`}
          cx={jitterX}
          cy={jitterY}
          r="7"
        />

        {/* Cycle label */}
        <text
          className="curve-label"
          x={W - PAD_X - 6}
          y={H - PAD_Y - 6}
          textAnchor="end"
        >
          {cycleMs > 0 ? `${cycleMs.toFixed(0)}ms cycle` : "—"}
        </text>
      </svg>
      <div className="curve-hint">
        <span className="curve-hint-duty">● duty {duty}%</span>
        <span className="curve-hint-jitter">● jitter {jitter}%</span>
        <span className="curve-hint-sep">drag points</span>
      </div>
    </div>
  );
}
