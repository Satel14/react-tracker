import React, { useState } from "react";
import { Row, Col, Input, Radio, Typography } from "antd";
import CountUp from "react-countup";
import { useNavigate } from "react-router-dom";

const { Title } = Typography;

const Player = () => {
  const [platform, setPlatform] = useState("steam");
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (value) => {
    const searchValue = typeof value === 'string' ? value : query;
    if (searchValue && searchValue.trim()) {
      navigate(`/player/${platform}/${searchValue.trim()}`);
    }
  };

  return (
    <div className="homepage">
      <Row>
        <Col span={12}>
          <div className="homepage_left">
            <div className="homepage_left__text">
              <Title level={1} style={{ color: '#fff', marginBottom: 0 }}>PUBG STATS</Title>
              <span>Check detailed PUBG stats and leaderboards</span>
            </div>
            <Radio.Group
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              buttonStyle="solid"
              className="radiostyle"
            >
              <Radio.Button value="steam">Steam</Radio.Button>
              <Radio.Button value="xbox">Xbox</Radio.Button>
              <Radio.Button value="psn">PSN</Radio.Button>
              <Radio.Button value="nintendo">Nintendo</Radio.Button>
            </Radio.Group>

            <Input.Search
              size="large"
              placeholder="Enter name, id or url"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onSearch={handleSearch}
              enterButton
            />

            <div className="homepage_left__stats">
              <div className="homepage_left__stats__seasonend">
                {/* <FieldTimeOutlined /> */}
                <div>
                  Last Hour
                  <span>
                    Player Online<span></span>
                    <CountUp separator="," end={1133462} />
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
};

export default Player;
