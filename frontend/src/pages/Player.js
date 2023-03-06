import React from "react";
import { Row, Col, Select, Input, Radio } from "antd";
// import { FienldTimeOutlined  } from "@ant-design/icons";
import CountUp from "react-countup";
const { Option } = Select;

const Player = (props) => (
  <div className="homepage">
    <Row>
      <Col span={12}>
        <div className="homepage_left">
          <div className="homepage_left__text">
            ROCKET LEAGUE STATS
            <span>Check detailed Rocket League Stats and Leaderboards</span>
          </div>
          <Radio.Group
            defaultValue="epic"
            buttonStyle="solid"
            className="radiostyle"
          >
            <Radio.Button value="epic">Epic</Radio.Button>
            <Radio.Button value="steam">Steam</Radio.Button>
            <Radio.Button value="xbox">Xbox</Radio.Button>
            <Radio.Button value="psn">PSN</Radio.Button>
            <Radio.Button value="nindento">Nindento</Radio.Button>
          </Radio.Group>
          <Input size="large" placeholder="Enter name, id or url" />

          <div className="homepage_left__stats">
            <div className="homepage_left__stats__seasonend">
              {/* <FienldTimeOutlined /> */}
              <div>
                Last Hour
                <span>
                  Player Online<span></span>
                  <CountUp separator="," end={213989} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </Col>
      <Col span={12}>
        <div className="homepage_right"></div>
      </Col>
    </Row>
  </div>
);

export default Player;
