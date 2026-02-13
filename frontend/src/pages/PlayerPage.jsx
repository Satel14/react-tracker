import React, { useState, useEffect } from "react";
import { Row, Col, Progress, Button, Spin, Alert } from "antd";
import { translate } from "react-switch-lang";
import CountUp from "react-countup";
import { SyncOutlined, HeartOutlined, LoadingOutlined } from "@ant-design/icons";
import { useParams } from "react-router-dom";
import { getPlayerData } from "../api/player";

const PlayerPage = ({ t }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const { platform, gameId } = useParams();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getPlayerData(platform, gameId);
      if (response && response.data && response.data.data) {
        setData(response.data.data);
      } else if (response && response.data) {
        setData(response.data);
      } else {
        setError("Player not found or private profile");
      }
    } catch (err) {
      setError(err.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (platform && gameId) {
      fetchData();
    }

  }, [platform, gameId]);


  if (loading) {
    return (
      <div className="playerpage" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 50, color: '#fde82b' }} spin />} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="playerpage" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', flexDirection: 'column' }}>
        <Alert message="Error" description={error} type="error" showIcon />
        <Button type="primary" onClick={fetchData} style={{ marginTop: 20 }}>Retry</Button>
      </div>
    )
  }

  if (!data) return null;

  const stats = data.segments && data.segments[0] && data.segments[0].stats ? data.segments[0].stats : {};

  return (
    <div className="playerpage">
      <div className="playerpage-buttons">
        <Button
          type="link"
          icon={<SyncOutlined />}
          size="small"
          onClick={fetchData}
        >
          {t("other.words.update")}
        </Button>
        <Button
          type="link"
          icon={<HeartOutlined />}
          size="small"
        >
          {t("menu.favorites")}
        </Button>
      </div>
      <Row className="first-row">
        <Col
          style={{ height: "100px" }}
          span={10}
          className="first-row__left"
        >
          <img
            src={data?.platformInfo?.avatarUrl || "https://avatars.akamai.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg"}
            alt={data?.platformInfo?.platformUserHandle || "Unknown"}
            className="first-row__left__avatar"
          />
          <div className="first-row__left__profile">
            <div className="first-row__left__profile__nickname">
              {data?.platformInfo?.platformUserHandle || "Unknown"}
            </div>
            <div className="first-row__left__profile__reward">
              <div className="first-row__left__profile__reward__title">
                {stats.timePlayed?.metadata?.rankName || "N/A"}

                {stats.timePlayed?.metadata?.iconUrl && (
                  <img
                    src={stats.timePlayed.metadata.iconUrl}
                    alt="Rank"
                    className="first-row__left__profile__reward__ranking"
                  />
                )}
              </div>
              <Progress percent={60} step={10} className="progress-reward" />
              <div className="first-row__left__profile__reward__label">
                <span>{t("pages.player.seasonRewardLevel")}</span>
                <span>6/10</span>
              </div>
            </div>
          </div>
        </Col>
        <Col
          style={{ height: "100px" }}
          span={14}
          className="first-row__right"
        >
          <div>
            <span>Wins</span>
            <CountUp
              separator=","
              end={stats.wins?.displayValue ? parseInt(stats.wins.displayValue.replace(/,/g, '')) : 0}
            />
          </div>
          <div>
            <span>Deaths</span>
            {stats.deaths?.displayValue || 0}
          </div>
          <div>
            <span>KD</span>
            {stats.kd?.displayValue || 0}
          </div>
          <div>
            <span>Revives</span>
            {stats.mvp?.displayValue || 0}
          </div>
          <div>
            <span>
              Headshots
            </span>
            {stats.headshotPct?.displayValue || "0"}
          </div>
        </Col>
      </Row>
      <Row className="second-row">
        <Col span={4} className="second-row__block">
          Matches
          <span>{stats.matchesPlayed?.displayValue || 0}</span>
        </Col>
        <Col span={4} className="second-row__block">
          Top 10s
          <span>{stats.top10s?.displayValue || 0}</span>
        </Col>
        <Col span={4} className="second-row__block">
          Win %
          <span>{stats.wlPercentage?.displayValue || "0%"}</span>
        </Col>
        <Col span={4} className="second-row__block">
          Damage
          <span>{stats.damage?.displayValue || 0}</span>
        </Col>
        <Col span={4} className="second-row__block">
          Hours
          <span>{stats.timePlayed?.displayValue || "0h"}</span>
        </Col>
        <Col span={4} className="second-row__block">
          Longest Kill
          <span>{stats.longestKill?.displayValue || 0}</span>
        </Col>
      </Row>
      <Row className="second-row" style={{ marginTop: '10px' }}>
        <Col span={4} className="second-row__block">
          Assists
          <span>{stats.assists?.displayValue || 0}</span>
        </Col>
        <Col span={4} className="second-row__block">
          Knockouts
          <span>{stats.dbnos?.displayValue || 0}</span>
        </Col>
        <Col span={4} className="second-row__block">
          Heals
          <span>{stats.heals?.displayValue || 0}</span>
        </Col>
        <Col span={4} className="second-row__block">
          Boosts
          <span>{stats.boosts?.displayValue || 0}</span>
        </Col>
        <Col span={4} className="second-row__block">
          Vehicle Kills
          <span>{stats.vehicleDestroys?.displayValue || 0}</span>
        </Col>
        <Col span={4} className="second-row__block">
          Road Kills
          <span>{stats.roadKills?.displayValue || 0}</span>
        </Col>
      </Row>
      <Row className="third-row">
        <Col span={10} className="third-row__left">
          <div className="third-row__left__title">
            {t("pages.player.ratingProgression")}
          </div>

          <div className="third-row__left__block ratingprogressiongraphs">
            {/* <RatingProgressionGraphs/> */}
          </div>
        </Col>
        <Col span={14} className="third-row__right">
          <div className="third-row__right__title">
            {t("pages.player.compotetive")}
          </div>

          <div className="third-row__right__rank"></div>
          <div className="third-row__right__rank"></div>
          <div className="third-row__right__rank"></div>
          <div className="third-row__right__rank"></div>

          <div className="third-row__right__title">
            {t("pages.player.wingman")}
          </div>

          <div className="third-row__right__rank"></div>
          <div className="third-row__right__rank"></div>
          <div className="third-row__right__rank"></div>
          <div className="third-row__right__rank">
            {/* {data.segments[8]} */}
          </div>

          <div className="third-row__right__title">

          </div>

          <div className="third-row__right__rank">
            {/* {stats.deaths.displayValue} */}
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default translate(PlayerPage);
