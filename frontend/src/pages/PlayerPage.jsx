import React, { useState, useEffect, useCallback } from "react";
import { Button, Spin, Alert, Tabs, Select } from "antd";
import { translate } from "react-switch-lang";
import {
  SyncOutlined,
  HeartOutlined,
  HeartFilled,
  LoadingOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  TrophyOutlined,
  BarChartOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import { useParams, useNavigate } from "react-router-dom";
import { getPlayerData, getPlayerReports } from "../api/player";
import { addHistory, FAVORITES_UPDATED_EVENT, isFavorite, toggleFavorite } from "../cookie/store";
import { resolvePreferredPlayerName } from "../helpers/playerIdentity";

const OVERVIEW_ITEMS = [
  { key: "matchesPlayed", label: "Matches", fallback: "0" },
  { key: "wins", label: "Wins", fallback: "0" },
  { key: "kd", label: "KD", fallback: "0" },
  { key: "wlPercentage", label: "Win %", fallback: "0%" },
  { key: "top10Rate", label: "Top 10 %", fallback: "0%" },
  { key: "timePlayed", label: "Hours", fallback: "0h" },
  { key: "avgDamage", label: "Avg Damage", fallback: "0" },
  { key: "killsPerMatch", label: "Kills / Match", fallback: "0" },
];

const ADVANCED_ITEMS = [
  { key: "kills", label: "Kills", fallback: "0" },
  { key: "deaths", label: "Deaths", fallback: "0" },
  { key: "top10s", label: "Top 10s", fallback: "0" },
  { key: "longestKill", label: "Longest Kill", fallback: "0" },
  { key: "longestSurvival", label: "Longest Survival", fallback: "0h 0m" },
  { key: "assists", label: "Assists", fallback: "0" },
  { key: "dbnos", label: "Knockouts", fallback: "0" },
  { key: "headshotRate", label: "Headshot Rate", fallback: "0%" },
  { key: "mvp", label: "Revives", fallback: "0" },
  { key: "heals", label: "Heals", fallback: "0" },
  { key: "boosts", label: "Boosts", fallback: "0" },
  { key: "roadKills", label: "Road Kills", fallback: "0" },
  { key: "vehicleDestroys", label: "Vehicle Kills", fallback: "0" },
  { key: "teamKills", label: "Team Kills", fallback: "0" },
  { key: "suicides", label: "Suicides", fallback: "0" },
];

const MODE_ITEMS = [
  { key: "matchesPlayed", label: "Matches", fallback: "0" },
  { key: "wins", label: "Wins", fallback: "0" },
  { key: "kd", label: "KD", fallback: "0" },
  { key: "wlPercentage", label: "Win %", fallback: "0%" },
  { key: "top10Rate", label: "Top 10 %", fallback: "0%" },
  { key: "avgDamage", label: "Avg Dmg", fallback: "0" },
];

const MODE_ORDER = ["solo", "duo", "squad"];
const MODE_LABELS = {
  solo: "Solo",
  duo: "Duo",
  squad: "Squad",
};

const REPORT_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "kill", label: "Kills" },
  { value: "death", label: "Deaths" },
];

const getDisplay = (stats, key, fallback = "0") => {
  return stats?.[key]?.displayValue || fallback;
};

const getSeasonLabel = (seasonId) => {
  if (typeof seasonId !== "string" || !seasonId.trim()) return "Current Season";
  const match = seasonId.match(/(\d+)\s*$/);
  if (!match) return "Current Season";
  return `Season #${match[1]}`;
};

const getReportTypeLabel = (type) => {
  if (type === "kill") return "Kill";
  if (type === "death") return "Death";
  return "Other";
};

const getReportTypeClass = (type) => {
  if (type === "kill") return "player-report-badge--kill";
  if (type === "death") return "player-report-badge--death";
  return "player-report-badge--other";
};

const formatReportDate = (value, fallback = "") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback || value;
  return date.toLocaleString();
};

const formatRankPoints = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "N/A";
};

const formatTopPercentage = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const fixed = parsed.toFixed(4).replace(/\.?0+$/, "");
  return fixed || "0";
};

const formatRankPlacement = (rankedInfo) => {
  if (!rankedInfo || typeof rankedInfo !== "object") return null;

  const rank = Number(rankedInfo?.leaderboardRank);
  const top = formatTopPercentage(rankedInfo?.topPercentage);
  const hasRank = Number.isFinite(rank) && rank > 0;
  const hasTop = typeof top === "string";

  if (!hasRank && !hasTop) return null;
  if (hasRank && hasTop) return `#${rank} (Top ${top}%)`;
  if (hasRank) return `#${rank}`;
  return `Top ${top}%`;
};

const getStatValue = (stats, key, fallback = 0) => {
  const parsed = Number(stats?.[key]?.value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampPercent = (value, max) => {
  const parsedValue = Number(value);
  const parsedMax = Number(max);
  if (!Number.isFinite(parsedValue) || !Number.isFinite(parsedMax) || parsedMax <= 0) return 0;
  if (parsedValue <= 0) return 0;
  return Math.max(4, Math.min(100, (parsedValue / parsedMax) * 100));
};

const formatMatchDate = (value) => {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getBanLabel = (banType) => {
  if (!banType) return "Unknown";
  if (banType === "Innocent") return "Clean";
  if (banType === "TemporaryBan") return "Temp ban";
  if (banType === "PermanentBan") return "Perm ban";
  return banType;
};

const RANK_PROGRESS_STEPS = [
  { key: "bronze", label: "Bronze", min: 0, next: 1400, nextLabel: "Silver" },
  { key: "silver", label: "Silver", min: 1400, next: 1800, nextLabel: "Gold" },
  { key: "gold", label: "Gold", min: 1800, next: 2200, nextLabel: "Platinum" },
  { key: "platinum", label: "Platinum", min: 2200, next: 3000, nextLabel: "Diamond" },
  { key: "diamond", label: "Diamond", min: 3000, next: 3400, nextLabel: "Master" },
  { key: "master", label: "Master", min: 3400, next: null, nextLabel: "Max" },
  { key: "grandmaster", label: "Grandmaster", min: 3400, next: null, nextLabel: "Max" },
  { key: "survivor", label: "Survivor", min: 3700, next: null, nextLabel: "Max" },
  { key: "top500", label: "Top 500", min: 3700, next: null, nextLabel: "Max" },
];

const getRankProgressMeta = (rankedInfo) => {
  const tier = String(rankedInfo?.tier || "").toLowerCase();
  const points = Number(rankedInfo?.currentRankPoint);
  const step = RANK_PROGRESS_STEPS.find((item) => item.key === tier) || null;

  if (!step || !Number.isFinite(points)) {
    return {
      progress: 0,
      leftLabel: rankedInfo?.label || "Unranked",
      rightLabel: "Ranked",
      detail: "No ranked RP data",
      pointsLabel: null,
      remainingLabel: "No ranked RP data",
    };
  }

  if (!step.next) {
    return {
      progress: 100,
      leftLabel: step.label,
      rightLabel: "Max",
      detail: `${formatRankPoints(points)} RP`,
      pointsLabel: `${formatRankPoints(points)} RP`,
      remainingLabel: "Highest rank bracket",
    };
  }

  const remaining = Math.max(step.next - points, 0);
  const progress = Math.max(0, Math.min(100, ((points - step.min) / (step.next - step.min)) * 100));
  return {
    progress,
    leftLabel: step.label,
    rightLabel: step.nextLabel,
    detail: `${formatRankPoints(points)} RP - ${formatRankPoints(remaining)} RP to ${step.nextLabel}`,
    pointsLabel: `${formatRankPoints(points)} RP`,
    remainingLabel: `${formatRankPoints(remaining)} RP to ${step.nextLabel}`,
  };
};

const getSurvivalMasteryTierMeta = (survivalMastery) => {
  const parsedTier = Number(survivalMastery?.tier);
  const parsedLevel = Number(survivalMastery?.level);

  const tier = Number.isFinite(parsedTier) && parsedTier > 0
    ? parsedTier
    : Number.isFinite(parsedLevel) && parsedLevel > 0
      ? Math.floor((parsedLevel - 1) / 100) + 1
      : null;

  if (!tier) return null;

  const normalizedTier = Math.max(1, Math.min(5, Math.round(tier)));
  return {
    tier: normalizedTier,
    label: `Survival Mastery Tier ${normalizedTier}`,
    iconUrl: `/images/mastery/SM_tier_${normalizedTier}.png`,
  };
};

const PlayerPage = ({ t }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [activeTabKey, setActiveTabKey] = useState("overview");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState(null);
  const [reportsData, setReportsData] = useState(null);
  const [reportsFilter, setReportsFilter] = useState("all");
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const { platform, gameId } = useParams();
  const navigate = useNavigate();

  const fetchData = useCallback(async (seasonId = null) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getPlayerData(platform, gameId, seasonId);
      if (response && response.data && response.data.data) {
        const payload = response.data.data;
        setData(payload);
        setSelectedSeasonId(payload?.selectedSeasonId || payload?.season?.id || seasonId || null);
      } else if (response && response.data) {
        setData(response.data);
        setSelectedSeasonId(response.data?.selectedSeasonId || response.data?.season?.id || seasonId || null);
      } else {
        setError("Player not found or private profile");
      }
    } catch (err) {
      if (err?.status === 422) {
        setError(err?.message || "Гравця не знайдено. Перевірте платформу та нікнейм.");
      } else {
        setError(err?.message || "Не вдалося завантажити дані гравця.");
      }
    } finally {
      setLoading(false);
    }
  }, [platform, gameId]);

  const fetchReports = useCallback(async (accountId, playerName) => {
    if (!accountId && !playerName) {
      setReportsData(null);
      return;
    }

    setReportsLoading(true);
    setReportsError(null);
    try {
      const response = await getPlayerReports(accountId, playerName);
      if (response && response.data && response.data.data) {
        setReportsData(response.data.data);
      } else if (response && response.data) {
        setReportsData(response.data);
      } else {
        setReportsData(null);
      }
    } catch (err) {
      setReportsError(err.message || "Failed to fetch PUBG Report data");
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const syncFavoriteState = useCallback(async () => {
    const favoriteId = data?.platformInfo?.platformUserId || gameId || null;
    if (!favoriteId) {
      setIsFavorited(false);
      return;
    }

    const value = await isFavorite(favoriteId);
    setIsFavorited(value);
  }, [data?.platformInfo?.platformUserId, gameId]);

  const handleToggleFavorite = useCallback(async () => {
    if (!data || favoriteLoading) return;

    const preferredName = resolvePreferredPlayerName(data?.platformInfo?.platformUserHandle, gameId);

    const payload = {
      id: data?.platformInfo?.platformUserId || gameId,
      gameId: data?.platformInfo?.platformUserId || gameId,
      accountId: data?.platformInfo?.platformUserId || null,
      nickname: preferredName || gameId,
      platform: platform || data?.platformInfo?.platformSlug || "steam",
      avatarUrl: data?.platformInfo?.avatarUrl || null,
    };

    setFavoriteLoading(true);
    try {
      const result = await toggleFavorite(payload);
      if (result && typeof result.favorited === "boolean") {
        setIsFavorited(result.favorited);
      } else {
        await syncFavoriteState();
      }
    } finally {
      setFavoriteLoading(false);
    }
  }, [data, favoriteLoading, gameId, platform, syncFavoriteState]);

  useEffect(() => {
    if (platform && gameId) {
      setActiveTabKey("overview");
      setSelectedSeasonId(null);
      setReportsData(null);
      setReportsError(null);
      setReportsFilter("all");
      setIsFavorited(false);
      fetchData(null);
    }
  }, [platform, gameId, fetchData]);

  useEffect(() => {
    const accountId = data?.platformInfo?.platformUserId || null;
    const playerName = data?.platformInfo?.platformUserHandle || gameId || null;

    if (!accountId && !playerName) return;
    fetchReports(accountId, playerName);
  }, [data?.platformInfo?.platformUserId, data?.platformInfo?.platformUserHandle, gameId, fetchReports]);

  useEffect(() => {
    const accountId = data?.platformInfo?.platformUserId || gameId || null;
    const playerName = resolvePreferredPlayerName(data?.platformInfo?.platformUserHandle, gameId) || null;
    const avatarUrl = data?.platformInfo?.avatarUrl || null;
    const rankedInfo = data?.season?.rankedInfo || null;
    const platformSlug = platform || data?.platformInfo?.platformSlug || "steam";
    const historyLookupId = playerName || accountId || null;

    if (!historyLookupId) return;
    addHistory(
      platformSlug,
      historyLookupId,
      playerName || historyLookupId,
      avatarUrl,
      rankedInfo?.iconUrl || rankedInfo?.iconFallbackUrl || null,
      rankedInfo?.label || null,
      rankedInfo?.currentRankPoint ?? null
    );
  }, [
    data?.platformInfo?.platformUserId,
    data?.platformInfo?.platformUserHandle,
    data?.platformInfo?.avatarUrl,
    data?.platformInfo?.platformSlug,
    data?.season?.rankedInfo,
    platform,
    gameId,
  ]);

  useEffect(() => {
    syncFavoriteState();
  }, [syncFavoriteState]);

  useEffect(() => {
    const onFavoritesUpdated = () => {
      syncFavoriteState();
    };

    window.addEventListener(FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
    return () => {
      window.removeEventListener(FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
    };
  }, [syncFavoriteState]);

  if (loading) {
    return (
      <div
        className="playerpage"
        style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}
      >
        <Spin indicator={<LoadingOutlined style={{ fontSize: 50, color: "#fde82b" }} spin />} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="playerpage"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
          flexDirection: "column",
        }}
      >
        <Alert message="Error" description={error} type="error" showIcon />
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/")}>
            Back
          </Button>
          <Button type="primary" onClick={() => fetchData(selectedSeasonId)}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const stats = data?.segments?.[0]?.stats || {};
  const seasons = Array.isArray(data?.seasons) ? data.seasons : [];
  const season = data?.season || null;
  const seasonStats = season?.stats || {};
  const seasonNormalStats = season?.breakdown?.normal || null;
  const seasonRankedStats = season?.breakdown?.ranked || null;
  const lifetimeModes = data?.modes || {};
  const seasonModes = season?.modes || {};
  const activeSeasonId = season?.id || selectedSeasonId || data?.selectedSeasonId || null;
  const activeSeasonMeta = seasons.find((item) => item.id === activeSeasonId) || null;
  const seasonLabel = activeSeasonMeta?.label || (season ? getSeasonLabel(season.id) : "Current Season");
  const seasonSubtitle = season?.includesRanked ? "Normal + Ranked" : null;
  const seasonOptions = seasons.map((item) => ({
    value: item.id,
    label: item.isCurrentSeason ? `${item.label} (Current)` : item.label,
  }));
  const headerRankedInfo = season?.rankedInfo || null;
  const headerRankPlacement = formatRankPlacement(headerRankedInfo);
  const rankBadgeUrl = headerRankedInfo?.iconUrl || headerRankedInfo?.iconFallbackUrl || "/images/ranks/opgg/unranked.png";
  const rankTitle = headerRankedInfo?.label || "Unranked";
  const rankProgress = getRankProgressMeta(headerRankedInfo);
  const profile = data?.profile || {};
  const clan = profile?.clan || null;
  const survivalMastery = profile?.survivalMastery || null;
  const survivalMasteryTier = getSurvivalMasteryTierMeta(survivalMastery);
  const matchSummary = data?.matches?.summary || {};
  const matchItems = Array.isArray(data?.matches?.items) ? data.matches.items : [];
  const banLabel = getBanLabel(profile?.banType);
  const hasBanWarning = profile?.banType && profile.banType !== "Innocent";

  const quickStats = [
    { label: "Wins", value: getDisplay(stats, "wins", "0") },
    { label: "KD", value: getDisplay(stats, "kd", "0") },
    { label: "Matches", value: getDisplay(stats, "matchesPlayed", "0") },
    { label: "Win %", value: getDisplay(stats, "wlPercentage", "0%") },
    { label: "Top 10 %", value: getDisplay(stats, "top10Rate", "0%") },
  ];

  const renderStatCard = (title, sourceStats, subtitle = null) => (
    <section className="player-card">
      <div className="player-card__head">
        <h3>{title}</h3>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>

      <div className="player-stat-grid">
        {OVERVIEW_ITEMS.map((item) => (
          <div key={`${title}-${item.key}`} className="player-stat-tile">
            <span className="player-stat-tile__label">{item.label}</span>
            <span className="player-stat-tile__value">{getDisplay(sourceStats, item.key, item.fallback)}</span>
          </div>
        ))}
      </div>

      <div className="player-card__divider" />

      <div className="player-stat-grid player-stat-grid--dense">
        {ADVANCED_ITEMS.map((item) => (
          <div key={`${title}-advanced-${item.key}`} className="player-stat-tile">
            <span className="player-stat-tile__label">{item.label}</span>
            <span className="player-stat-tile__value">{getDisplay(sourceStats, item.key, item.fallback)}</span>
          </div>
        ))}
      </div>
    </section>
  );

  const renderSeasonCard = () => {
    if (!season) {
      return renderEmptyCard("Current Season", "Season stats are not available for this profile.");
    }

    const unrankedMatches = getDisplay(seasonNormalStats, "matchesPlayed", "0");
    const rankedMatches = getDisplay(seasonRankedStats, "matchesPlayed", "0");
    const totalMatches = getDisplay(seasonStats, "matchesPlayed", "0");
    const rankedInfo = season?.rankedInfo || null;
    const rankedPlacement = formatRankPlacement(rankedInfo);

    return (
      <section className="player-card">
        <div className="player-card__head">
          <h3>{seasonLabel}</h3>
          <div className="player-card__controls">
            {seasonSubtitle ? <span>{seasonSubtitle}</span> : null}
            {seasonOptions.length > 0 ? (
              <Select
                className="player-season-select"
                size="small"
                value={activeSeasonId || undefined}
                options={seasonOptions}
                onChange={(value) => {
                  setSelectedSeasonId(value);
                  fetchData(value);
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="player-card__meta">
          {rankedInfo ? (
            <div className="player-meta-badge player-meta-badge--rank">
              <div className="player-rank">
                <img
                  src={rankedInfo.iconUrl}
                  alt={rankedInfo.label || "Rank"}
                  className="player-rank__icon"
                  onError={(e) => {
                    const fallback = rankedInfo?.iconFallbackUrl || "/images/ranks/opgg/unranked.png";
                    const usedFallback = e.currentTarget.dataset.fallbackApplied === "1";

                    if (!usedFallback && fallback) {
                      e.currentTarget.dataset.fallbackApplied = "1";
                      e.currentTarget.src = fallback;
                      return;
                    }

                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "/images/ranks/opgg/unranked.png";
                  }}
                />
                <div className="player-rank__text">
                  <span>{rankedInfo.label || "Ranked"}</span>
                  <strong>{`${formatRankPoints(rankedInfo.currentRankPoint)} RP`}</strong>
                  {rankedPlacement ? <small>{rankedPlacement}</small> : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="player-meta-badge">
            <span>Unranked matches</span>
            <strong>{unrankedMatches}</strong>
          </div>
          <div className="player-meta-badge">
            <span>Ranked matches</span>
            <strong>{rankedMatches}</strong>
          </div>
          <div className="player-meta-badge">
            <span>Total matches</span>
            <strong>{totalMatches}</strong>
          </div>
        </div>

        <div className="player-card__divider" />

        <div className="player-stat-grid">
          {OVERVIEW_ITEMS.map((item) => (
            <div key={`${seasonLabel}-${item.key}`} className="player-stat-tile">
              <span className="player-stat-tile__label">{item.label}</span>
              <span className="player-stat-tile__value">{getDisplay(seasonStats, item.key, item.fallback)}</span>
            </div>
          ))}
        </div>

        <div className="player-card__divider" />

        <div className="player-stat-grid player-stat-grid--dense">
          {ADVANCED_ITEMS.map((item) => (
            <div key={`${seasonLabel}-advanced-${item.key}`} className="player-stat-tile">
              <span className="player-stat-tile__label">{item.label}</span>
              <span className="player-stat-tile__value">{getDisplay(seasonStats, item.key, item.fallback)}</span>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderModeSection = (title, modes) => {
    const availableModeKeys = MODE_ORDER.filter((modeKey) => {
      const modeStats = modes?.[modeKey]?.stats;
      return modeStats && Number(modeStats.matchesPlayed?.value || 0) > 0;
    });

    if (availableModeKeys.length === 0) return null;

    return (
      <section className="player-card">
        <div className="player-card__head">
          <h3>{title}</h3>
        </div>
        <div className="player-mode-grid">
          {availableModeKeys.map((modeKey) => {
            const modeStats = modes[modeKey].stats;
            return (
              <div className="player-mode-card" key={`${title}-${modeKey}`}>
                <div className="player-mode-card__title">{MODE_LABELS[modeKey]}</div>
                <div className="player-mode-card__stats">
                  {MODE_ITEMS.map((item) => (
                    <div className="player-mode-stat" key={`${modeKey}-${item.key}`}>
                      <span className="player-mode-stat__label">{item.label}</span>
                      <span className="player-mode-stat__value">
                        {getDisplay(modeStats, item.key, item.fallback)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const renderEmptyCard = (title, message) => (
    <section className="player-card player-card--empty">
      <div className="player-card__head">
        <h3>{title}</h3>
      </div>
      <div className="player-empty">{message}</div>
    </section>
  );

  const renderProgressBars = (items) => (
    <div className="player-chart-bars">
      {items.map((item) => (
        <div className="player-chart-bar" key={item.label}>
          <div className="player-chart-bar__head">
            <span>{item.label}</span>
            <strong>{item.displayValue}</strong>
          </div>
          <div className="player-chart-bar__track">
            <span style={{ width: `${clampPercent(item.value, item.max)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );

  const renderRecentFormChart = () => {
    const series = matchItems.slice().reverse();
    if (series.length < 2) {
      return <div className="player-chart-empty">Need at least two recent matches for a trend chart.</div>;
    }

    const width = 320;
    const height = 120;
    const xStep = series.length > 1 ? width / (series.length - 1) : width;
    const maxKills = Math.max(...series.map((item) => item.kills || 0), 1);
    const maxDamage = Math.max(...series.map((item) => item.damage || 0), 1);
    const toPoints = (key, max) =>
      series
        .map((item, index) => {
          const x = Math.round(index * xStep);
          const y = Math.round(height - 12 - ((Number(item[key]) || 0) / max) * (height - 24));
          return `${x},${y}`;
        })
        .join(" ");

    return (
      <div className="player-line-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent match performance trend">
          <polyline className="player-line-chart__grid" points={`0,${height - 12} ${width},${height - 12}`} />
          <polyline className="player-line-chart__damage" points={toPoints("damage", maxDamage)} />
          <polyline className="player-line-chart__kills" points={toPoints("kills", maxKills)} />
        </svg>
        <div className="player-line-chart__legend">
          <span><i className="is-kills" /> Kills</span>
          <span><i className="is-damage" /> Damage</span>
        </div>
      </div>
    );
  };

  const renderChartsCard = () => {
    const chartStats = season ? seasonStats : stats;
    const chartModes = season ? seasonModes : lifetimeModes;
    const modeRows = MODE_ORDER
      .map((modeKey) => {
        const modeStats = chartModes?.[modeKey]?.stats;
        if (!modeStats || Number(modeStats.matchesPlayed?.value || 0) <= 0) return null;
        return {
          label: MODE_LABELS[modeKey],
          value: getStatValue(modeStats, "avgDamage"),
          displayValue: getDisplay(modeStats, "avgDamage", "0"),
          max: 500,
        };
      })
      .filter(Boolean);

    const combatBars = [
      { label: "K/D", value: getStatValue(chartStats, "kd"), displayValue: getDisplay(chartStats, "kd", "0"), max: 8 },
      {
        label: "Avg Damage",
        value: getStatValue(chartStats, "avgDamage"),
        displayValue: getDisplay(chartStats, "avgDamage", "0"),
        max: 500,
      },
      {
        label: "Kills / Match",
        value: getStatValue(chartStats, "killsPerMatch"),
        displayValue: getDisplay(chartStats, "killsPerMatch", "0"),
        max: 5,
      },
      {
        label: "Headshot %",
        value: getStatValue(chartStats, "headshotRate"),
        displayValue: getDisplay(chartStats, "headshotRate", "0%"),
        max: 60,
      },
    ];

    const resultBars = [
      {
        label: "Win Rate",
        value: getStatValue(chartStats, "wlPercentage"),
        displayValue: getDisplay(chartStats, "wlPercentage", "0%"),
        max: 40,
      },
      {
        label: "Top 10 Rate",
        value: getStatValue(chartStats, "top10Rate"),
        displayValue: getDisplay(chartStats, "top10Rate", "0%"),
        max: 80,
      },
      {
        label: "Recent Avg Kills",
        value: Number(matchSummary.avgKills || 0),
        displayValue: Number(matchSummary.avgKills || 0).toFixed(2),
        max: 5,
      },
      {
        label: "Recent Avg Damage",
        value: Number(matchSummary.avgDamage || 0),
        displayValue: `${Math.round(Number(matchSummary.avgDamage || 0))}`,
        max: 500,
      },
    ];

    return (
      <section className="player-card">
        <div className="player-card__head">
          <h3>Performance Charts</h3>
          <span>{season ? seasonLabel : "Lifetime"}</span>
        </div>

        <div className="player-chart-grid">
          <div className="player-chart-panel">
            <h4><BarChartOutlined /> Combat</h4>
            {renderProgressBars(combatBars)}
          </div>
          <div className="player-chart-panel">
            <h4><TrophyOutlined /> Results</h4>
            {renderProgressBars(resultBars)}
          </div>
          <div className="player-chart-panel">
            <h4><BarChartOutlined /> Avg Damage by Mode</h4>
            {modeRows.length ? renderProgressBars(modeRows) : <div className="player-chart-empty">No mode data yet.</div>}
          </div>
          <div className="player-chart-panel">
            <h4><HistoryOutlined /> Recent Form</h4>
            {renderRecentFormChart()}
          </div>
        </div>
      </section>
    );
  };

  const renderMatchesCard = () => {
    if (!matchItems.length) {
      return renderEmptyCard("Recent Matches", "No recent match history returned for this player.");
    }

    return (
      <section className="player-card">
        <div className="player-card__head">
          <h3>Recent Matches</h3>
          <span>Last {matchItems.length} API matches</span>
        </div>

        <div className="player-card__meta">
          <div className="player-meta-badge">
            <span>Matches</span>
            <strong>{matchSummary.total || matchItems.length}</strong>
          </div>
          <div className="player-meta-badge">
            <span>Wins</span>
            <strong>{matchSummary.wins || 0}</strong>
          </div>
          <div className="player-meta-badge">
            <span>Top 10s</span>
            <strong>{matchSummary.top10s || 0}</strong>
          </div>
          <div className="player-meta-badge">
            <span>Avg Damage</span>
            <strong>{Math.round(Number(matchSummary.avgDamage || 0))}</strong>
          </div>
        </div>

        <div className="player-card__divider" />

        <div className="player-match-list">
          {matchItems.map((match) => (
            <article className={`player-match-item ${match.isWin ? "player-match-item--win" : ""}`} key={match.id}>
              <div className="player-match-item__main">
                <div>
                  <strong>{match.placementLabel}</strong>
                  <span>{match.isWin ? "Chicken Dinner" : formatMatchDate(match.createdAt)}</span>
                </div>
                <div>
                  <b>{match.mapName}</b>
                  <span>{match.gameModeLabel}</span>
                </div>
              </div>

              <div className="player-match-stats">
                <div><span>Kills</span><strong>{match.kills}</strong></div>
                <div><span>Damage</span><strong>{match.damage}</strong></div>
                <div><span>Assists</span><strong>{match.assists}</strong></div>
                <div><span>DBNOs</span><strong>{match.dbnos}</strong></div>
                <div><span>Survived</span><strong>{match.survivalTimeLabel}</strong></div>
                <div><span>Longest</span><strong>{match.longestKill}m</strong></div>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  };

  const modeLifetimeSection = renderModeSection("By Mode - Lifetime", lifetimeModes);
  const modeSeasonSection = season ? renderModeSection(`By Mode - ${seasonLabel}`, seasonModes) : null;
  const reportSummary = reportsData?.summary || {};
  const reportItems = Array.isArray(reportsData?.encounters) ? reportsData.encounters : [];
  const filteredReportItems =
    reportsFilter === "all" ? reportItems : reportItems.filter((item) => item.type === reportsFilter);

  const renderReportsCard = () => {
    if (reportsLoading) {
      return (
        <section className="player-card player-card--empty">
          <div className="player-empty">
            <Spin indicator={<LoadingOutlined style={{ fontSize: 26, color: "#fde82b" }} spin />} />
          </div>
        </section>
      );
    }

    if (reportsError) {
      return renderEmptyCard("Twitch Reports", reportsError);
    }

    if (!reportItems.length) {
      return renderEmptyCard("Twitch Reports", "No PUBG Report encounters found for this player.");
    }

    return (
      <section className="player-card">
        <div className="player-card__head">
          <h3>Twitch Reports</h3>
          <div className="player-card__controls">
            <Select
              size="small"
              className="player-season-select"
              value={reportsFilter}
              options={REPORT_FILTER_OPTIONS}
              onChange={(value) => setReportsFilter(value)}
            />
          </div>
        </div>

        <div className="player-card__meta">
          <div className="player-meta-badge">
            <span>Total events</span>
            <strong>{reportSummary.total || 0}</strong>
          </div>
          <div className="player-meta-badge">
            <span>Kills</span>
            <strong>{reportSummary.kills || 0}</strong>
          </div>
          <div className="player-meta-badge">
            <span>Deaths</span>
            <strong>{reportSummary.deaths || 0}</strong>
          </div>
        </div>

        <div className="player-card__divider" />

        <div className="player-report-list">
          {filteredReportItems.map((item) => (
            <article className="player-report-item" key={item.id}>
              <div className="player-report-item__head">
                <span className={`player-report-badge ${getReportTypeClass(item.type)}`}>
                  {getReportTypeLabel(item.type)}
                </span>
                <span className="player-report-date">
                  {formatReportDate(item.timeEvent, item.dateLabel || "Unknown time")}
                </span>
              </div>

              <div className="player-report-item__line">
                <strong>{item.killer || "Unknown"}</strong>
                <span>vs</span>
                <strong>{item.victim || "Unknown"}</strong>
              </div>

              <div className="player-report-meta">
                <span>{item.mode || "Mode n/a"}</span>
                <span>{item.map || "Map n/a"}</span>
                <span>{Number(item.distance || 0)}m</span>
                <span>{item.timeDiff || "--:--:--"}</span>
              </div>

              <div className="player-report-actions">
                {item?.links?.clip ? (
                  <a href={item.links.clip} target="_blank" rel="noreferrer noopener" className="player-link-button">
                    Open Clip
                  </a>
                ) : null}
                {item?.links?.twitch ? (
                  <a
                    href={item.links.twitch}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="player-link-button player-link-button--alt"
                  >
                    Open Twitch VOD
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  };

  const tabItems = [
    {
      key: "overview",
      label: "Overview",
      children: renderStatCard("Lifetime Overview", stats),
    },
    {
      key: "season",
      label: "Season",
      children: renderSeasonCard(),
    },
    {
      key: "modes",
      label: "Modes",
      children:
        modeLifetimeSection || modeSeasonSection ? (
          <>
            {modeLifetimeSection}
            {modeSeasonSection}
          </>
        ) : (
          renderEmptyCard("By Mode", "No mode-specific stats available yet.")
        ),
    },
    {
      key: "charts",
      label: "Charts",
      children: renderChartsCard(),
    },
    {
      key: "matches",
      label: "Matches",
      children: renderMatchesCard(),
    },
    {
      key: "reports",
      label: "Twitch Reports",
      children: renderReportsCard(),
    },
  ];

  return (
    <div className="playerpage playerpage--compact">
      <div className="playerpage-buttons">
        <Button type="link" icon={<SyncOutlined />} size="small" onClick={() => fetchData(activeSeasonId)}>
          {t("other.words.update")}
        </Button>
        <Button
          type="link"
          icon={isFavorited ? <HeartFilled /> : <HeartOutlined />}
          size="small"
          loading={favoriteLoading}
          className={isFavorited ? "is-active" : ""}
          onClick={handleToggleFavorite}
        >
          {isFavorited ? t("other.words.removeFavorite") : t("other.words.addFavorite")}
        </Button>
      </div>

      <section className="player-card player-card--header">
        <div className="player-hero-rank">
          <img
            src={rankBadgeUrl}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/images/ranks/opgg/unranked.png";
            }}
            alt={rankTitle}
            className="player-hero-rank__badge"
          />
          <div className="player-hero-rank__progress">
            <div className="player-rank-progress__path">
              <span>{rankProgress.leftLabel}</span>
              <ArrowRightOutlined />
              <strong>{rankProgress.rightLabel}</strong>
            </div>
            <div className="player-rank-progress__track">
              <span style={{ width: `${rankProgress.progress}%` }} />
            </div>
            <div className="player-rank-progress__details">
              {rankProgress.pointsLabel ? <strong>{rankProgress.pointsLabel}</strong> : null}
              <span>{rankProgress.remainingLabel || rankProgress.detail}</span>
            </div>
          </div>
        </div>

        <div className="player-hero-main">
          <div className="player-identity player-identity--minimal">
            <div className="player-identity__meta">
              <div className="player-identity__name">{data?.platformInfo?.platformUserHandle || "Unknown"}</div>
              <div className="player-identity__badges">
                <span>{(data?.platformInfo?.platformSlug || platform || "steam").toUpperCase()}</span>
                <span>{rankTitle}</span>
                {headerRankPlacement ? <span>{headerRankPlacement}</span> : null}
                {clan?.tag ? <span>[{clan.tag}]</span> : null}
                {hasBanWarning ? <span className="is-danger">{banLabel}</span> : null}
              </div>
              {survivalMasteryTier ? (
                <div className="player-mastery-chip">
                  <img
                    src={survivalMasteryTier.iconUrl}
                    alt={survivalMasteryTier.label}
                    onError={(e) => {
                      const usedFallback = e.currentTarget.dataset.fallbackApplied === "1";
                      if (usedFallback) return;
                      e.currentTarget.dataset.fallbackApplied = "1";
                      e.currentTarget.src = "/images/mastery/SM_tier_1.png";
                    }}
                  />
                  <div>
                    <span>Survival Mastery</span>
                    <strong>
                      Tier {survivalMasteryTier.tier}
                      {survivalMastery?.level ? ` - Lv ${survivalMastery.level}` : ""}
                    </strong>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="player-quick-grid">
            {quickStats.map((item) => (
              <div key={item.label} className="player-quick-stat">
                <span className="player-quick-stat__label">{item.label}</span>
                <span className="player-quick-stat__value">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Tabs className="player-tabs" activeKey={activeTabKey} onChange={setActiveTabKey} items={tabItems} />
    </div>
  );
};

export default translate(PlayerPage);

