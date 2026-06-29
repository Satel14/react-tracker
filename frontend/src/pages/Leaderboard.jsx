import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Table, Select, Radio, Input, Spin, Alert, Button, Tooltip } from "antd";
import { LoadingOutlined, ReloadOutlined, SwapOutlined } from "@ant-design/icons";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { translate } from "react-switch-lang";
import { getLeaderboard, getSeasons } from "../api/leaderboard";

const REGIONS = [
  { value: "pc-na", label: "PC · NA" },
  { value: "pc-eu", label: "PC · EU" },
  { value: "pc-as", label: "PC · AS" },
  { value: "pc-sea", label: "PC · SEA" },
  { value: "pc-sa", label: "PC · SA" },
  { value: "pc-kakao", label: "PC · KAKAO" },
];
const GAME_MODES = ["solo", "solo-fpp", "duo", "duo-fpp", "squad", "squad-fpp"];
const DEFAULT_PLATFORM = "pc-eu";
const DEFAULT_MODE = "squad-fpp";
const MAX_COMPARE = 3;

const pct = (ratio) => `${(Number(ratio || 0) * 100).toFixed(1)}%`;
const round = (n) => Math.round(Number(n || 0));
const dec1 = (n) => Number(n || 0).toFixed(1);

const Leaderboard = ({ t }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const platform = searchParams.get("platform") || DEFAULT_PLATFORM;
  const gameMode = searchParams.get("mode") || DEFAULT_MODE;
  const seasonParam = searchParams.get("season") || null;

  const [seasons, setSeasons] = useState([]);
  const [season, setSeason] = useState(seasonParam);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [selected, setSelected] = useState([]);
  const [reloadToken, setReloadToken] = useState(0);

  // Debounce the search box (6).
  useEffect(() => {
    const id = setTimeout(() => setNameFilter(searchInput), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const patchParams = useCallback(
    (patch) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(patch).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Load the season catalog whenever the platform changes.
  useEffect(() => {
    let cancelled = false;
    getSeasons(platform)
      .then((res) => {
        if (cancelled) return;
        const catalog = res?.data || {};
        setSeasons(catalog.seasons || []);
        setSeason((prev) => prev || seasonParam || catalog.currentSeasonId || null);
      })
      .catch(() => {
        if (!cancelled) setSeasons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [platform, seasonParam]);

  // Load the leaderboard whenever platform / mode / season / manual reload changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLeaderboard(platform, gameMode, season)
      .then((res) => {
        if (cancelled) return;
        if (res?.data?.entries) {
          setEntries(res.data.entries);
          setUpdatedAt(new Date());
        } else {
          setEntries([]);
          if (res?.message) setError(t("pages.leaderboards.error"));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([]);
          setError(t("pages.leaderboards.error"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [platform, gameMode, season, reloadToken, t]);

  // Clear selection when the dataset changes.
  useEffect(() => {
    setSelected([]);
  }, [platform, gameMode, season]);

  const filtered = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((row) => (row.name || "").toLowerCase().includes(q));
  }, [entries, nameFilter]);

  const columns = useMemo(
    () => [
      { title: t("pages.leaderboards.rank"), dataIndex: "rank", key: "rank", width: 64, sorter: (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity), defaultSortOrder: "ascend" },
      {
        title: t("pages.leaderboards.player"),
        dataIndex: "name",
        key: "name",
        render: (name) => <Link to={`/player/steam/${encodeURIComponent(name)}`}>{name}</Link>,
      },
      {
        title: t("pages.leaderboards.tier"),
        dataIndex: "tier",
        key: "tier",
        responsive: ["md"],
        render: (tier, row) => {
          if (!tier) return <span className="leaderboard-page__tier-empty">—</span>;
          const label = `${tier}${row.subTier ? ` ${row.subTier}` : ""}`;
          return (
            <span className="leaderboard-page__tier">
              <img
                className="leaderboard-page__tier-icon"
                src={row.tierIconUrl || row.tierIconFallbackUrl || "/images/ranks/opgg/unranked.png"}
                alt={label}
                loading="lazy"
                onError={(e) => {
                  if (row.tierIconFallbackUrl && e.currentTarget.src.indexOf(row.tierIconFallbackUrl) === -1) {
                    e.currentTarget.src = row.tierIconFallbackUrl;
                  } else {
                    e.currentTarget.src = "/images/ranks/opgg/unranked.png";
                  }
                }}
              />
              <span>{label}</span>
            </span>
          );
        },
      },
      { title: t("pages.leaderboards.rp"), dataIndex: "rankPoints", key: "rankPoints", render: round, sorter: (a, b) => a.rankPoints - b.rankPoints },
      { title: t("pages.leaderboards.games"), dataIndex: "games", key: "games", responsive: ["sm"], render: round, sorter: (a, b) => a.games - b.games },
      { title: t("pages.leaderboards.wins"), dataIndex: "wins", key: "wins", responsive: ["lg"], render: round, sorter: (a, b) => a.wins - b.wins },
      { title: t("pages.leaderboards.winRate"), dataIndex: "winRatio", key: "winRatio", responsive: ["sm"], render: pct, sorter: (a, b) => a.winRatio - b.winRatio },
      { title: t("pages.leaderboards.avgRank"), dataIndex: "avgRank", key: "avgRank", responsive: ["lg"], render: (v) => (v ? `#${dec1(v)}` : "—"), sorter: (a, b) => a.avgRank - b.avgRank },
      { title: t("pages.leaderboards.avgKills"), dataIndex: "avgKills", key: "avgKills", responsive: ["lg"], render: dec1, sorter: (a, b) => a.avgKills - b.avgKills },
      { title: t("pages.leaderboards.avgDamage"), dataIndex: "avgDamage", key: "avgDamage", responsive: ["md"], render: round, sorter: (a, b) => a.avgDamage - b.avgDamage },
      { title: t("pages.leaderboards.kills"), dataIndex: "kills", key: "kills", render: round, sorter: (a, b) => a.kills - b.kills },
    ],
    [t]
  );

  const selectionFull = selected.length >= MAX_COMPARE;

  const rowSelection = {
    selectedRowKeys: selected,
    // No select-all: Compare takes at most MAX_COMPARE players.
    hideSelectAll: true,
    onChange: (keys) => {
      // Cap the selection at MAX_COMPARE (keep the most recently picked).
      setSelected(keys.slice(-MAX_COMPARE));
    },
    getCheckboxProps: (row) => ({
      disabled: !selected.includes(rowKeyOf(row)) && selectionFull,
    }),
    renderCell: (checked, row, index, node) => {
      const isDisabled = !checked && selectionFull;
      if (!isDisabled) return node;
      return (
        <Tooltip title={t("pages.leaderboards.compareLimit", { max: MAX_COMPARE })}>
          {/* wrap in a span so the tooltip still fires over the disabled checkbox */}
          <span className="leaderboard-page__cb-disabled">{node}</span>
        </Tooltip>
      );
    },
  };

  const handleCompare = () => {
    const byKey = new Map(entries.map((e) => [rowKeyOf(e), e]));
    const params = new URLSearchParams();
    selected
      .map((key) => byKey.get(key))
      .filter(Boolean)
      .slice(0, MAX_COMPARE)
      .forEach((row, i) => {
        params.set(`p${i + 1}`, `steam:${row.name}`);
      });
    navigate(`/compare?${params.toString()}`);
  };

  return (
    <div className="content leaderboard-page">
      <div className="leaderboard-page__head">
        <h2>{t("pages.leaderboards.title")}</h2>
        <p>{t("pages.leaderboards.subtitle")}</p>
      </div>

      <div className="leaderboard-page__filters">
        <Select
          className="leaderboard-page__platform"
          popupClassName="leaderboard-page__dropdown"
          value={platform}
          onChange={(value) => patchParams({ platform: value })}
          options={REGIONS}
        />
        <Radio.Group
          value={gameMode}
          onChange={(e) => patchParams({ mode: e.target.value })}
          optionType="button"
          buttonStyle="solid"
          options={GAME_MODES.map((m) => ({ value: m, label: m }))}
        />
        <Select
          className="leaderboard-page__season"
          popupClassName="leaderboard-page__dropdown"
          value={season || undefined}
          onChange={(value) => { setSeason(value); patchParams({ season: value }); }}
          options={seasons.map((s) => ({ value: s.id, label: s.label || s.id }))}
        />
        <Input
          className="leaderboard-page__search"
          placeholder={t("pages.leaderboards.search")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          allowClear
        />
        <Tooltip title={t("pages.leaderboards.refresh")}>
          <Button
            className="leaderboard-page__icon-btn"
            aria-label={t("pages.leaderboards.refresh")}
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => setReloadToken((n) => n + 1)}
            disabled={loading}
          />
        </Tooltip>
      </div>

      <div className="leaderboard-page__meta">
        <span className="leaderboard-page__count">
          {t("pages.leaderboards.showing", { count: filtered.length, total: entries.length })}
        </span>
        {updatedAt ? (
          <span className="leaderboard-page__updated">
            {t("pages.leaderboards.updated", { time: updatedAt.toLocaleTimeString() })}
          </span>
        ) : null}
        {selected.length >= 2 ? (
          <Button
            className="leaderboard-page__compare-btn"
            type="primary"
            size="small"
            icon={<SwapOutlined />}
            onClick={handleCompare}
          >
            {t("pages.leaderboards.compare", { count: selected.length })}
          </Button>
        ) : null}
      </div>

      {error ? <Alert type="error" message={error} showIcon /> : null}

      {loading ? (
        <div className="leaderboard-page__loading">
          <Spin indicator={<LoadingOutlined style={{ fontSize: 28, color: "#fde82b" }} spin />} />
        </div>
      ) : (
        <Table
          className="leaderboard-page__table"
          rowKey={rowKeyOf}
          rowSelection={rowSelection}
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 50, showSizeChanger: false }}
          locale={{ emptyText: t("pages.leaderboards.empty") }}
          scroll={{ x: 720 }}
          size="middle"
        />
      )}
    </div>
  );
};

function rowKeyOf(row) {
  return row.accountId || `${row.rank}-${row.name}`;
}

export default translate(Leaderboard);
