import React from "react";
import { Row, Col, Progress, Button } from "antd";
import player from "../data/player";
import { translate } from "react-switch-lang";
import CountUp from "react-countup";
import { SyncOutlined, HeartOutlined } from "@ant-design/icons";

class PlayerPage extends React.Component {
  state = {
    loading: [],
  };

  // componentDidMount() {
  //   this.getData();
  // }

  enterLoading = (index) => {
    this.setState(({ loadings }) => {
      const newLoadings = [...loadings];
      newLoadings[index] = true;

      return {
        loadings: newLoadings,
      };
    });
    setTimeout(() => {
      this.setState(({ loadings }) => {
        const newLoadings = [...loadings];
        newLoadings[index] = true;

        return {
          loadings: newLoadings,
        };
      });
    }, 6000);
  };

  render() {
    const { t } = this.props;
    const { loading } = this.state;
    return (
      <div className="playerpage">
        <div className="playerpage-buttons">
          <Button
            type="link"
            icon={<SyncOutlined />}
            loading={loading[1]}
            size="small"
            onClick={() => this.enterLoading(1)}
          >
            {loading[1] ? "Updating" : "Update"}
          </Button>
          <Button
            type="link"
            icon={<HeartOutlined />}
            loading={loading[1]}
            size="small"
            onClick={() => this.enterLoading(1)}
          >
            {"Favorite"}
          </Button>
        </div>
        <Row className="first-row">
          <Col
            style={{ height: "100px" }}
            span={10}
            className="first-row__left"
          >
            <img
              src={player.data.platformInfo.avatarUrl}
              alt={player.data.platformInfo.platformUserHandle}
              className="first-row__left__avatar"
            />
            <div className="first-row__left__profile">
              <div className="first-row__left__profile__nickname">
                {player.data.platformInfo.platformUserHandle}
              </div>
              <div className="first-row__left__profile__reward">
                <div className="first-row__left__profile__reward__title">
                  {player.data.segments[0].stats.timePlayed.metadata.rankName}

                  <img
                    src={
                      player.data.segments[0].stats.timePlayed.metadata.iconUrl
                    }
                    alt={
                      player.data.segments[0].stats.wlPercentage.metadata
                        .rankName
                    }
                    className="first-row__left__profile__reward__ranking"
                  />
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
              <span>{t("pages.player.seasonRewardLevel.mini.wins")}</span>
              <CountUp
                separator=","
                end={player.data.segments[0].stats.wins.displayValue}
              />
            </div>
            <div>
              <span>{t("pages.player.seasonRewardLevel.mini.deaths")}</span>
              {player.data.segments[0].stats.deaths.displayValue}
            </div>
            <div>
              <span>KD</span>
              {player.data.segments[0].stats.kd.displayValue}
            </div>
            <div>
              <span>{t("pages.player.seasonRewardLevel.mini.mvps")}</span>
              {player.data.segments[0].stats.mvp.displayValue}
            </div>
            <div>
              <span>
                {t("pages.player.seasonRewardLevel.mini.shotsAccuracy")}
              </span>
              {player.data.segments[0].stats.headshotPct.displayValue}
            </div>
          </Col>
        </Row>
        <Row className="second-row">
          <Col span={4} className="second-row__block">
            {t("pages.player.mini.seasonMatches")}
            <span>{player.data.segments[0].stats.matchesPlayed.displayValue}</span>
          </Col>
          <Col span={4} className="second-row__block">
            {t("pages.player.mini.roundsPlayed")}
            <span>{player.data.segments[0].stats.roundsPlayed.displayValue}</span>
          </Col>
          <Col span={4} className="second-row__block">
            {t("pages.player.mini.wlPercentage")}
            <span>{player.data.segments[0].stats.wlPercentage.displayValue}</span>
          </Col>
          <Col span={4} className="second-row__block">
            {t("pages.player.mini.damage")}
            <span>{player.data.segments[0].stats.damage.displayValue}</span>
          </Col>
          <Col span={4} className="second-row__block">
            {t("pages.player.mini.hoursPlayed")}
            <span>{player.data.segments[0].stats.timePlayed.displayValue}</span>
          </Col>
          <Col span={4} className="second-row__block">
            {t("pages.player.mini.bombsDefused")}
            <span>{player.data.segments[0].stats.bombsDefused.displayValue}</span>
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
              {t("pages.player.extraMods")}
            </div>

            <div className="third-row__right__rank"></div>
            <div className="third-row__right__rank"></div>
            <div className="third-row__right__rank"></div>
            <div className="third-row__right__rank">
              {player.data.segments[8]}
            </div>

            <div className="third-row__right__title">
              {t("pages.player.playlists.UnRanked")}
            </div>

            <div className="third-row__right__rank">
              {player.data.segments[0].stats.deaths.displayValue}
            </div>
          </Col>
        </Row>
      </div>
    );
  }
}

export default translate(PlayerPage);
