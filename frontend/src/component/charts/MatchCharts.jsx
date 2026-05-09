import React, { useMemo } from "react";
// This file is itself lazy-loaded from PlayerPage via React.lazy, so recharts
// already lands in a separate chunk — react-doctor's static-import check is a false positive.
// oxlint-disable-next-line react-doctor/prefer-dynamic-import
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getCurrentLocale } from "../../helpers/locale";

const COLORS = {
  kills: "#78f7a8",
  damage: "#fde82b",
  killsMa: "rgba(120, 247, 168, 0.55)",
  damageMa: "rgba(253, 232, 43, 0.55)",
  grid: "rgba(255, 255, 255, 0.08)",
  axis: "#9fa3bf",
  win: "#fde82b",
  top5: "#f5b455",
  top10: "#78f7a8",
  top25: "#5ab4ff",
  rest: "#9fa3bf",
};

const TOOLTIP_STYLE = {
  background: "rgba(8, 14, 26, 0.95)",
  border: "1px solid rgba(120, 247, 168, 0.32)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "#fff",
  fontSize: 12,
  lineHeight: 1.4,
};

const PLACEMENT_BUCKETS = [
  { key: "win", label: "#1 Win", test: (p) => p === 1, color: COLORS.win },
  { key: "top5", label: "Top 5", test: (p) => p > 1 && p <= 5, color: COLORS.top5 },
  { key: "top10", label: "Top 10", test: (p) => p > 5 && p <= 10, color: COLORS.top10 },
  { key: "top25", label: "Top 25", test: (p) => p > 10 && p <= 25, color: COLORS.top25 },
  { key: "rest", label: ">25", test: (p) => p > 25, color: COLORS.rest },
];

const movingAverage = (values, window = 3) => {
  if (!values.length) return [];
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    return Number((sum / slice.length).toFixed(2));
  });
};

const formatMatchLabel = (createdAt, fallbackIndex, locale) => {
  if (!createdAt) return `#${fallbackIndex + 1}`;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return `#${fallbackIndex + 1}`;
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div>{point.mapName} - {point.gameModeLabel}</div>
      <div>Placement: <strong>#{point.placement || "-"}</strong></div>
      <div>Kills: <strong style={{ color: COLORS.kills }}>{point.kills}</strong></div>
      <div>Damage: <strong style={{ color: COLORS.damage }}>{point.damage}</strong></div>
    </div>
  );
};

const PlacementTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600 }}>{item.label}</div>
      <div>Matches: <strong>{item.count}</strong></div>
    </div>
  );
};

const MapTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.mapName}</div>
      <div>Matches: <strong>{item.matches}</strong></div>
      <div>Avg placement: <strong>#{item.avgPlacement}</strong></div>
      <div>Avg kills: <strong>{item.avgKills}</strong></div>
      <div>Wins: <strong>{item.wins}</strong></div>
    </div>
  );
};

export const PerformanceTrendChart = ({ items }) => {
  const locale = getCurrentLocale();
  const data = useMemo(() => {
    if (!Array.isArray(items) || items.length < 2) return [];
    const ordered = items
      .slice()
      .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
    const killsSeries = ordered.map((m) => Number(m.kills) || 0);
    const damageSeries = ordered.map((m) => Number(m.damage) || 0);
    const killsMa = movingAverage(killsSeries);
    const damageMa = movingAverage(damageSeries);

    return ordered.map((m, index) => ({
      label: formatMatchLabel(m.createdAt, index, locale),
      kills: killsSeries[index],
      damage: damageSeries[index],
      killsMa: killsMa[index],
      damageMa: damageMa[index],
      mapName: m.mapName || "Unknown",
      gameModeLabel: m.gameModeLabel || m.gameMode || "",
      placement: m.placement,
    }));
  }, [items, locale]);

  if (data.length < 2) {
    return <div className="player-chart-empty">Need at least two recent matches for a trend chart.</div>;
  }

  return (
    <div className="match-chart match-chart--trend">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" stroke={COLORS.axis} tick={{ fontSize: 10 }} />
          <YAxis yAxisId="left" stroke={COLORS.kills} tick={{ fontSize: 10 }} width={28} />
          <YAxis yAxisId="right" orientation="right" stroke={COLORS.damage} tick={{ fontSize: 10 }} width={36} />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: "rgba(255,255,255,0.18)" }} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="kills"
            stroke={COLORS.kills}
            strokeWidth={2.5}
            dot={{ r: 3, fill: COLORS.kills }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="damage"
            stroke={COLORS.damage}
            strokeWidth={2.5}
            dot={{ r: 3, fill: COLORS.damage }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="killsMa"
            stroke={COLORS.killsMa}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="damageMa"
            stroke={COLORS.damageMa}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="match-chart__legend">
        <span><i style={{ background: COLORS.kills }} /> Kills</span>
        <span><i style={{ background: COLORS.damage }} /> Damage</span>
        <span><i style={{ background: COLORS.killsMa }} /> Kills MA(3)</span>
        <span><i style={{ background: COLORS.damageMa }} /> Damage MA(3)</span>
      </div>
    </div>
  );
};

export const PlacementDistributionChart = ({ items }) => {
  const data = useMemo(() => {
    if (!Array.isArray(items) || !items.length) return [];
    const counts = PLACEMENT_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      color: bucket.color,
      count: 0,
    }));
    items.forEach((m) => {
      const placement = Number(m.placement);
      if (!Number.isFinite(placement) || placement <= 0) return;
      const idx = PLACEMENT_BUCKETS.findIndex((b) => b.test(placement));
      if (idx >= 0) counts[idx].count += 1;
    });
    return counts;
  }, [items]);

  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (!total) {
    return <div className="player-chart-empty">No placement data in recent matches.</div>;
  }

  return (
    <div className="match-chart match-chart--placement">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={COLORS.axis} tick={{ fontSize: 11 }} />
          <YAxis stroke={COLORS.axis} tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
          <Tooltip content={<PlacementTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const MODE_COLORS = {
  solo: "#78f7a8",
  duo: "#fde82b",
  squad: "#5ab4ff",
};

const MODE_LABELS = {
  solo: "Solo",
  duo: "Duo",
  squad: "Squad",
};

const RADAR_AXES = [
  { key: "kd", label: "K/D", max: 5 },
  { key: "wlPercentage", label: "Win %", max: 30 },
  { key: "avgDamage", label: "Avg DMG", max: 500 },
  { key: "top10Rate", label: "Top 10 %", max: 60 },
  { key: "killsPerMatch", label: "Kills/Match", max: 5 },
];

const readModeStat = (modes, modeKey, statKey) => {
  const raw = modes?.[modeKey]?.stats?.[statKey]?.value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ModesTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((entry) => {
        const raw = entry.payload?.[`${entry.dataKey}__raw`];
        return (
          <div key={entry.dataKey} style={{ color: entry.color }}>
            {MODE_LABELS[entry.dataKey] || entry.dataKey}:{" "}
            <strong>{raw !== undefined ? raw : entry.value}</strong>
          </div>
        );
      })}
    </div>
  );
};

export const ModesRadarChart = ({ modes }) => {
  const { activeModes, data } = useMemo(() => {
    const modeKeys = Object.keys(MODE_LABELS).filter(
      (key) => Number(modes?.[key]?.stats?.matchesPlayed?.value || 0) > 0
    );

    if (!modeKeys.length) {
      return { activeModes: [], data: [] };
    }

    const points = RADAR_AXES.map((axis) => {
      const point = { axis: axis.label };
      modeKeys.forEach((modeKey) => {
        const raw = readModeStat(modes, modeKey, axis.key);
        const normalized = Math.max(0, Math.min(100, (raw / axis.max) * 100));
        point[modeKey] = Number(normalized.toFixed(1));
        point[`${modeKey}__raw`] = Number.isInteger(raw) ? raw : Number(raw.toFixed(2));
      });
      return point;
    });

    return { activeModes: modeKeys, data: points };
  }, [modes]);

  if (!activeModes.length) {
    return <div className="player-chart-empty">No mode-specific stats available yet.</div>;
  }

  return (
    <div className="match-chart match-chart--modes-radar">
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} outerRadius="78%">
          <PolarGrid stroke={COLORS.grid} />
          <PolarAngleAxis dataKey="axis" tick={{ fill: COLORS.axis, fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} stroke={COLORS.grid} />
          {activeModes.map((modeKey) => (
            <Radar
              key={modeKey}
              name={MODE_LABELS[modeKey]}
              dataKey={modeKey}
              stroke={MODE_COLORS[modeKey]}
              fill={MODE_COLORS[modeKey]}
              fillOpacity={0.18}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
          <Legend
            wrapperStyle={{ fontSize: 11, color: COLORS.axis, paddingTop: 4 }}
            iconType="circle"
          />
          <Tooltip content={<ModesTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const MapPerformanceChart = ({ items }) => {
  const data = useMemo(() => {
    if (!Array.isArray(items) || !items.length) return [];
    const groups = new Map();
    items.forEach((m) => {
      const name = m.mapName || "Unknown";
      const placement = Number(m.placement);
      const kills = Number(m.kills) || 0;
      const wins = m.isWin ? 1 : 0;
      if (!groups.has(name)) {
        groups.set(name, { mapName: name, matches: 0, placementSum: 0, killsSum: 0, wins: 0 });
      }
      const entry = groups.get(name);
      entry.matches += 1;
      if (Number.isFinite(placement) && placement > 0) entry.placementSum += placement;
      entry.killsSum += kills;
      entry.wins += wins;
    });

    return Array.from(groups.values())
      .map((entry) => ({
        mapName: entry.mapName,
        matches: entry.matches,
        avgPlacement: entry.matches ? Math.round(entry.placementSum / entry.matches) : 0,
        avgKills: entry.matches ? Number((entry.killsSum / entry.matches).toFixed(1)) : 0,
        wins: entry.wins,
      }))
      .sort((a, b) => b.matches - a.matches);
  }, [items]);

  if (!data.length) {
    return <div className="player-chart-empty">No map data in recent matches.</div>;
  }

  const chartHeight = Math.max(120, data.length * 36 + 28);

  return (
    <div className="match-chart match-chart--maps">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" stroke={COLORS.axis} tick={{ fontSize: 10 }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="mapName"
            stroke={COLORS.axis}
            tick={{ fontSize: 11 }}
            width={84}
          />
          <Tooltip content={<MapTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="matches" fill={COLORS.kills} radius={[0, 6, 6, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
