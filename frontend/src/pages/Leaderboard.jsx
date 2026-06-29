import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Table, Select, Radio, Input, Spin, Alert } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
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

const pct = (ratio) => `${(Number(ratio || 0) * 100).toFixed(1)}%`;
const round = (n) => Math.round(Number(n || 0));

const Leaderboard = ({ t }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const platform = searchParams.get("platform") || DEFAULT_PLATFORM;
  const gameMode = searchParams.get("mode") || DEFAULT_MODE;
  const seasonParam = searchParams.get("season") || null;

  const [seasons, setSeasons] = useState([]);
  const [season, setSeason] = useState(seasonParam);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nameFilter, setNameFilter] = useState("");

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

  // Load the leaderboard whenever platform / mode / season changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLeaderboard(platform, gameMode, season)
      .then((res) => {
        if (cancelled) return;
        if (res?.data?.entries) {
          setEntries(res.data.entries);
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
  }, [platform, gameMode, season, t]);

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
        render: (tier, row) => (tier ? `${tier}${row.subTier ? ` ${row.subTier}` : ""}` : "—"),
      },
      { title: t("pages.leaderboards.rp"), dataIndex: "rankPoints", key: "rankPoints", render: round, sorter: (a, b) => a.rankPoints - b.rankPoints },
      { title: t("pages.leaderboards.games"), dataIndex: "games", key: "games", render: round, sorter: (a, b) => a.games - b.games },
      { title: t("pages.leaderboards.wins"), dataIndex: "wins", key: "wins", render: round, sorter: (a, b) => a.wins - b.wins },
      { title: t("pages.leaderboards.winRate"), dataIndex: "winRatio", key: "winRatio", render: pct, sorter: (a, b) => a.winRatio - b.winRatio },
      { title: t("pages.leaderboards.avgDamage"), dataIndex: "avgDamage", key: "avgDamage", render: round, sorter: (a, b) => a.avgDamage - b.avgDamage },
      { title: t("pages.leaderboards.kills"), dataIndex: "kills", key: "kills", render: round, sorter: (a, b) => a.kills - b.kills },
    ],
    [t]
  );

  return (
    <div className="content leaderboard-page">
      <div className="leaderboard-page__head">
        <h2>{t("pages.leaderboards.title")}</h2>
        <p>{t("pages.leaderboards.subtitle")}</p>
      </div>

      <div className="leaderboard-page__filters">
        <Select
          className="leaderboard-page__platform"
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
          value={season || undefined}
          onChange={(value) => { setSeason(value); patchParams({ season: value }); }}
          options={seasons.map((s) => ({ value: s.id, label: s.label || s.id }))}
        />
        <Input
          className="leaderboard-page__search"
          placeholder={t("pages.leaderboards.search")}
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          allowClear
        />
      </div>

      {error ? <Alert type="error" message={error} showIcon /> : null}

      {loading ? (
        <div className="leaderboard-page__loading">
          <Spin indicator={<LoadingOutlined style={{ fontSize: 28, color: "#fde82b" }} spin />} />
        </div>
      ) : (
        <Table
          className="leaderboard-page__table"
          rowKey={(row) => row.accountId || `${row.rank}-${row.name}`}
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 50, showSizeChanger: false }}
          locale={{ emptyText: t("pages.leaderboards.empty") }}
          size="middle"
        />
      )}
    </div>
  );
};

export default translate(Leaderboard);
