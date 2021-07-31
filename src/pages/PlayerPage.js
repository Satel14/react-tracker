import React from "react";
import { Row, Col, Progress } from "antd";
import player from "../data/player";
import data from "../data/player";


class PlayerPage extends React.Component {
  render() {
    return (
      <div className="playerpage">
        <Row className="first-row">
          <Col
            style={{ height: "100px" }}
            span={10}
            className="first-row__left"
          >
            <img
              src={player.data.platformInfo.avatarUrl}
              alt={player.data.platformInfo.platformUserHandle}
            />
            <div className="first-row__left__profile">
              <div className="first-row__left__profile__nickname">
                {player.data.platformInfo.platformUserHandle}
              </div>
              <div className="first-row__left__profile__reward">
                <div></div>
                <Progress percent={60} step={10} className="progress-reward" />
                <div className="first-row__left__profile__reward__label">
                  <span>Reward level</span>
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
              {player.data.segments[0].stats.wins.displayValue}
            </div>
            <div>
              <span>Deaths</span>
              {player.data.segments[0].stats.deaths.displayValue}
            </div>
            <div>
              <span>KD</span>
              {player.data.segments[0].stats.kd.displayValue}
            </div>
            <div>
              <span>MVPs</span>
              {player.data.segments[0].stats.mvp.displayValue}
            </div>
            <div>
              <span>Shots Accuracy</span>
              {player.data.segments[0].stats.headshotPct.displayValue}
            </div>
          </Col>
        </Row>
        <Row className="second-row">
          <Col span={4} className="second-row__block"></Col>
          <Col span={4} className="second-row__block"></Col>
          <Col span={4} className="second-row__block"></Col>
          <Col span={4} className="second-row__block"></Col>
          <Col span={4} className="second-row__block"></Col>
          <Col span={4} className="second-row__block"></Col>
        </Row>
        <Row className="third-row">
          <Col span={10} className="third-row__left">
            <div className="third-row__left__title">Player stats</div>

            <div className="third-row__left__block"></div>
          </Col>
          <Col span={14} className="third-row__right">
            <div className="third-row__right__title">Competetive</div>

            <div className="third-row__right__rank"></div>
            <div className="third-row__right__rank"></div>
            <div className="third-row__right__rank"></div>
            <div className="third-row__right__rank"></div>

            <div className="third-row__right__title">Extra mode</div>

            <div className="third-row__right__rank"></div>
            <div className="third-row__right__rank"></div>
            <div className="third-row__right__rank"></div>
            <div className="third-row__right__rank"></div>

            <div className="third-row__right__title">Unranked</div>

            <div className="third-row__right__rank"></div>
          </Col>
        </Row>
      </div>
    );
  }
}

export default PlayerPage;
