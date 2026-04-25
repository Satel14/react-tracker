import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Spin } from "antd";
import {
  ArrowLeftOutlined,
  CloseOutlined,
  LoadingOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { translate } from "react-switch-lang";
import { getPlayerData } from "../api/player";
import { resolvePreferredPlayerName, normalizePlatform } from "../helpers/playerIdentity";
import { getPlatformAvatar } from "../helpers/other";

const COMPARE_ROWS = [
  { key: "matchesPlayed", label: "Matches", direction: "higher" },
  { key: "wins", label: "Wins", direction: "higher" },
  { key: "kd", label: "K/D", direction: "higher" },
  { key: "wlPercentage", label: "Win %", direction: "higher" },
  { key: "top10Rate", label: "Top 10 %", direction: "higher" },
  { key: "avgDamage", label: "Avg Damage", direction: "higher" },
  { key: "killsPerMatch", label: "Kills / Match", direction: "higher" },
  { key: "headshotRate", label: "Headshot %", direction: "higher" },
  { key: "kills", label: "Total Kills", direction: "higher" },
  { key: "longestKill", label: "Longest Kill", direction: "higher" },
  { key: "top10s", label: "Top 10s", direction: "higher" },
  { key: "timePlayed", label: "Hours", direction: "higher" },
];

const parseSlot = (raw) => {
  if (typeof raw !== "string" || !raw.includes(":")) return null;
  const [platformPart, ...rest] = raw.split(":");
  const id = rest.join(":").trim();
  if (!id) return null;
  return { platform: normalizePlatform(platformPart), id };
};

const buildSlotParam = (slot) => `${slot.platform}:${slot.id}`;

const getStatValue = (stats, key) => {
  const parsed = Number(stats?.[key]?.value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getStatDisplay = (stats, key) => stats?.[key]?.displayValue || "-";

const Compare = ({ t }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const slots = useMemo(() => {
    const collected = [];
    ["p1", "p2", "p3"].forEach((key) => {
      const slot = parseSlot(searchParams.get(key));
      if (slot) collected.push(slot);
    });
    return collected;
  }, [searchParams]);

  const [profiles, setProfiles] = useState({});

  useEffect(() => {
    let cancelled = false;
    const next = {};

    const load = async () => {
      await Promise.all(
        slots.map(async (slot) => {
          const slotKey = buildSlotParam(slot);
          next[slotKey] = { loading: true, error: null, data: null };
          setProfiles((prev) => ({ ...prev, [slotKey]: next[slotKey] }));

          try {
            const response = await getPlayerData(slot.platform, slot.id, null);
            const payload = response?.data?.data || response?.data || null;
            if (cancelled) return;
            if (payload && payload.platformInfo) {
              setProfiles((prev) => ({
                ...prev,
                [slotKey]: { loading: false, error: null, data: payload },
              }));
            } else {
              setProfiles((prev) => ({
                ...prev,
                [slotKey]: { loading: false, error: "Player not found", data: null },
              }));
            }
          } catch (err) {
            if (cancelled) return;
            setProfiles((prev) => ({
              ...prev,
              [slotKey]: { loading: false, error: err?.message || "Load failed", data: null },
            }));
          }
        })
      );
    };

    if (slots.length) load();

    return () => {
      cancelled = true;
    };
  }, [slots]);

  const updateSlots = useCallback(
    (nextSlots) => {
      const params = new URLSearchParams();
      nextSlots.slice(0, 3).forEach((slot, index) => {
        params.set(`p${index + 1}`, buildSlotParam(slot));
      });
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  const handleRemoveSlot = (index) => {
    const next = slots.filter((_, i) => i !== index);
    updateSlots(next);
  };

  const handleSwapSlots = () => {
    if (slots.length < 2) return;
    const next = [...slots];
    [next[0], next[1]] = [next[1], next[0]];
    updateSlots(next);
  };

  const winners = useMemo(() => {
    if (slots.length < 2) return {};
    const result = {};
    COMPARE_ROWS.forEach((row) => {
      let bestIndex = -1;
      let bestValue = null;

      slots.forEach((slot, index) => {
        const slotKey = buildSlotParam(slot);
        const data = profiles[slotKey]?.data;
        const stats = data?.segments?.[0]?.stats;
        const value = getStatValue(stats, row.key);
        if (value === null) return;

        if (bestValue === null) {
          bestValue = value;
          bestIndex = index;
        } else if (row.direction === "higher" && value > bestValue) {
          bestValue = value;
          bestIndex = index;
        } else if (row.direction === "lower" && value < bestValue) {
          bestValue = value;
          bestIndex = index;
        }
      });

      result[row.key] = bestIndex;
    });
    return result;
  }, [slots, profiles]);

  if (!slots.length) {
    return (
      <div className="content compare-page compare-page--empty">
        <div className="compare-empty">
          <h2>{t("pages.compare.title")}</h2>
          <p>{t("pages.compare.empty")}</p>
          <Link to="/favorites" className="ant-btn ant-btn-primary">
            {t("pages.compare.goFavorites")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="content compare-page">
      <div className="compare-page__toolbar">
        <Button type="link" icon={<ArrowLeftOutlined />} size="small" onClick={() => navigate(-1)}>
          {t("pages.compare.back")}
        </Button>
        {slots.length >= 2 ? (
          <Button type="link" icon={<SwapOutlined />} size="small" onClick={handleSwapSlots}>
            {t("pages.compare.swap")}
          </Button>
        ) : null}
      </div>

      <div className={`compare-grid compare-grid--cols-${slots.length}`}>
        {slots.map((slot, index) => {
          const slotKey = buildSlotParam(slot);
          const entry = profiles[slotKey] || { loading: true, error: null, data: null };
          const data = entry.data;
          const platformInfo = data?.platformInfo || {};
          const rankedInfo = data?.season?.rankedInfo || null;
          const displayName =
            resolvePreferredPlayerName(platformInfo.platformUserHandle, slot.id) || slot.id;
          const avatar = platformInfo.avatarUrl || getPlatformAvatar(slot.platform);
          const rankBadge = rankedInfo?.iconUrl || rankedInfo?.iconFallbackUrl || "/images/ranks/opgg/unranked.png";

          return (
            <div className="compare-column" key={slotKey}>
              <div className="compare-column__head">
                <button
                  type="button"
                  className="compare-column__remove"
                  aria-label={t("pages.compare.remove")}
                  onClick={() => handleRemoveSlot(index)}
                >
                  <CloseOutlined />
                </button>

                {entry.loading ? (
                  <div className="compare-column__loading">
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: "#fde82b" }} spin />} />
                  </div>
                ) : entry.error ? (
                  <Alert type="error" message={entry.error} showIcon />
                ) : (
                  <Link to={`/player/${slot.platform}/${slot.id}`} className="compare-column__profile">
                    <img
                      src={avatar}
                      alt={displayName}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/images/steam_avatar.jpg";
                      }}
                    />
                    <div>
                      <strong>{displayName}</strong>
                      <span>{slot.platform.toUpperCase()}</span>
                    </div>
                    <img
                      src={rankBadge}
                      alt={rankedInfo?.label || "Unranked"}
                      className="compare-column__rank"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/images/ranks/opgg/unranked.png";
                      }}
                    />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="compare-table">
        {COMPARE_ROWS.map((row) => (
          <div className="compare-row" key={row.key}>
            <div className="compare-row__label">{row.label}</div>
            <div className={`compare-row__values compare-row__values--cols-${slots.length}`}>
              {slots.map((slot, index) => {
                const slotKey = buildSlotParam(slot);
                const data = profiles[slotKey]?.data;
                const stats = data?.segments?.[0]?.stats;
                const display = getStatDisplay(stats, row.key);
                const value = getStatValue(stats, row.key);
                const isWinner = slots.length >= 2 && winners[row.key] === index && value !== null;
                return (
                  <span
                    key={slotKey}
                    className={`compare-cell ${isWinner ? "compare-cell--winner" : ""} ${
                      value === null ? "compare-cell--missing" : ""
                    }`}
                  >
                    {display}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default translate(Compare);
