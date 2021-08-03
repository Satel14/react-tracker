import React from "react";
import { FieldTimeOutlined, TeamOutlined } from "@ant-design/icons";
import { Select } from "@material-ui/core";
import { Row, Col, Radio, Input } from "antd";
import CountUp from "react-countup";
const { Option } = Select;

const Home = (props) => (
  <div className="homepage">
    <Row style={{ justifyContent: "center" }}>
      <Col span={12}>
        <div className="homepage_left">
          <div className="homepage_left__text">
            Counter-Strike: Global Offensive Stats
            <span>
              Check Detailed Counter-Strike: Global Offensive Stats and
              Leaderboards
            </span>
          </div>
          <Radio.Group
            defaultValue="steam"
            buttonStyle="solid"
            className="radiostyle"
          >
            <Radio.Button value="steam">Steam</Radio.Button>
          </Radio.Group>
          <Input size="large" placeholder="Enter name, id or url" />
        

          <div className="homepage_left__stats">
            <div className="homepage_left__stats__seasonend">
              <FieldTimeOutlined />
              <div>
                Season 3
                <span>
                  Ends in: {""}
                  <span>
                    in <CountUp end={14} /> days
                  </span>
                </span>
              </div>
            </div>
            <div className="homepage_left__stats__playeronline">
              <TeamOutlined />
              <div>
                Last Hour
                <span>
                  Player Online <span></span>
                  <CountUp separator="," end={213989} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </Col>
    </Row>
  </div>
);

export default Home;
