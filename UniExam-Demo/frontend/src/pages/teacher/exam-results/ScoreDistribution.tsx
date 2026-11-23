import { useEffect, useRef, useState } from 'react';
import type { ExamResults, ResultRow } from '../../../entities/submission/types';
import { Card } from '../../../shared/ui';
import './ScoreDistribution.css';

const decimal = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

export function ScoreDistribution({ rows, stats }: Pick<ExamResults, 'rows' | 'stats'>) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<{ key: string; text: string; x: number } | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Keep the same population as the API: only completed, valid grading results.
  const graded = rows.filter((row): row is ResultRow & { score: number; maxScore: number } =>
    row.submissionStatus === 'graded' && row.score !== null && Number.isFinite(row.score)
    && row.maxScore !== null && Number.isFinite(row.maxScore) && row.maxScore > 0);
  const scores = graded.map((row) => row.score / row.maxScore * 10).sort((a, b) => a - b);
  const count = scores.length;
  const bins = Array.from({ length: 10 }, () => 0);
  scores.forEach((score) => { bins[Math.min(9, Math.max(0, Math.floor(score)))] += 1; });

  // An exam normally has one maximum. Convert the API's rounded statistics so
  // the reference lines agree with the summary cards, including non-10 scales.
  const commonMax = graded[0]?.maxScore;
  const sameScale = graded.every((row) => row.maxScore === commonMax);
  const average = count ? (sameScale && stats.averageScore !== null
    ? stats.averageScore / commonMax * 10
    : scores.reduce((sum, score) => sum + score, 0) / count) : 0;
  const median = count ? (sameScale && stats.medianScore !== null
    ? stats.medianScore / commonMax * 10
    : (scores[Math.floor((count - 1) / 2)] + scores[Math.floor(count / 2)]) / 2) : 0;
  const dotPlot = count < 8;
  const stacks = new Map<number, number>();
  const dots = scores.map((score) => {
    const level = (stacks.get(score) ?? 0) + 1;
    stacks.set(score, level);
    return { score, level };
  });

  const left = 40;
  const right = width - 18;
  const top = 72;
  const bottom = 252;
  const step = Math.max(1, Math.ceil(Math.max(...bins) / 4));
  const maximum = Math.max(step, Math.ceil(Math.max(...bins) / step) * step);
  const x = (score: number) => left + Math.max(0, Math.min(10, score)) / 10 * (right - left);
  const y = (value: number) => bottom - value / maximum * (bottom - top);
  const binWidth = (right - left) / 10;
  const averageX = x(average);
  const medianX = x(median);
  const stagger = Math.abs(averageX - medianX) < 120;
  const ticks = Array.from({ length: maximum / step + 1 }, (_, index) => index * step);
  const label = (position: number, text: string, labelY: number) => (
    <text x={Math.max(left, Math.min(right, position))} y={labelY}
      textAnchor={position < left + 65 ? 'start' : position > right - 65 ? 'end' : 'middle'}
      className="score-distribution-marker-label">{text}</text>
  );
  const tooltip = active && (active.key.startsWith('bin-') ? !dotPlot : dotPlot) ? active : null;

  return (
    <Card className="score-distribution">
      <h2>Phân bố điểm (thang 10)</h2>
      <div ref={container} className="score-distribution-plot">
        {!count ? <p className="muted">Chưa có bài được chấm</p> : (
          <>
            <svg viewBox={`0 0 ${width} 300`} role="img"
              aria-label={`Phân bố điểm: trung bình ${decimal.format(average)}, trung vị ${decimal.format(median)}, ${count} bài`}
              onMouseLeave={() => setActive(null)}>
              {!dotPlot && <>
                <text x={left} y={top - 12} className="score-distribution-axis-label">Số sinh viên</text>
                {ticks.map((tick) => (
                  <g key={tick}>
                    <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="score-distribution-grid" />
                    <text x={left - 10} y={y(tick) + 4} textAnchor="end">{tick}</text>
                  </g>
                ))}
                <line x1={left} x2={left} y1={top} y2={bottom} className="score-distribution-grid" />
              </>}
              <line x1={left} x2={right} y1={bottom} y2={bottom} className="score-distribution-grid" />
              <line x1={x(5)} x2={x(5)} y1={top} y2={bottom} className="score-distribution-pass" />
              <text x={x(5) + 5} y={top + 14} className="score-distribution-axis-label">Đạt</text>

              {dotPlot ? dots.map(({ score, level }, index) => (
                <circle key={index} cx={x(score)} cy={bottom - 10 - (level - 1) * 20} r={7}
                  className="score-distribution-dot" tabIndex={0}
                  aria-label={`${decimal.format(score)} điểm`}
                  onMouseEnter={() => setActive({ key: `dot-${index}`, text: `${decimal.format(score)} điểm`, x: x(score) })}
                  onFocus={() => setActive({ key: `dot-${index}`, text: `${decimal.format(score)} điểm`, x: x(score) })}
                  onBlur={() => setActive(null)} />
              )) : bins.map((value, index) => {
                const barX = x(index) + 1;
                const barY = y(value);
                const barWidth = binWidth - 2;
                const radius = Math.min(4, (bottom - barY) / 2, barWidth / 2);
                return <path key={index} className="score-distribution-bar"
                  d={`M ${barX} ${bottom} V ${barY + radius} Q ${barX} ${barY} ${barX + radius} ${barY} H ${barX + barWidth - radius} Q ${barX + barWidth} ${barY} ${barX + barWidth} ${barY + radius} V ${bottom} Z`} />;
              })}

              <g className="score-distribution-markers">
                <line x1={averageX} x2={averageX} y1={28} y2={bottom} strokeWidth={1.5} />
                <line x1={medianX} x2={medianX} y1={stagger ? 50 : 28} y2={bottom} strokeWidth={2.5} strokeDasharray="6 5" />
                {label(averageX, `TB ${decimal.format(average)}`, 22)}
                {label(medianX, `Trung vị ${decimal.format(median)}`, stagger ? 44 : 22)}
              </g>

              {Array.from({ length: 11 }, (_, index) => (
                <g key={index}>
                  <line x1={x(index)} x2={x(index)} y1={bottom} y2={bottom + 5} className="score-distribution-grid" />
                  <text x={x(index)} y={bottom + 22} textAnchor="middle">{index}</text>
                </g>
              ))}
              <text x={right} y={295} textAnchor="end" className="score-distribution-axis-label">Điểm</text>

              {!dotPlot && bins.map((value, index) => {
                const text = `${index}–${index + 1} điểm: ${value} sinh viên (${percent.format(value / count * 100)}%)`;
                const activate = () => setActive({ key: `bin-${index}`, text, x: x(index + 0.5) });
                return (
                  <rect key={index} x={x(index)} y={top} width={binWidth} height={bottom - top}
                    className="score-distribution-hit" tabIndex={0} aria-label={text}
                    onMouseEnter={activate} onFocus={activate} onBlur={() => setActive(null)}>
                    <title>{text}</title>
                  </rect>
                );
              })}
            </svg>
            {tooltip && <div className="score-distribution-tooltip" role="tooltip"
              style={{ left: `clamp(min(120px, 40%), ${tooltip.x / width * 100}%, calc(100% - min(120px, 40%)))` }}>
              {tooltip.text}
            </div>}
          </>
        )}
      </div>
    </Card>
  );
}
