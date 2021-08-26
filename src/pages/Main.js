import React, { useState } from "react";
import { FieldTimeOutlined, TeamOutlined } from "@ant-design/icons";
import CountUp from "react-countup";
import { Row, Col, Radio, Input } from "antd";
import { translate } from "react-switch-lang";
import { Fade } from "react-reveal/Fade";
import { withRouter } from "react-router";
const Main = (props) => {
  const [platform, setPlatform] = useState("steam");
  const { t } = props;
  return (
    <div className="homepage">
      <Row style={{ justifyContent: "center" }}>
        <Col span={12}>
          <div className="homepage_left">
            <div className="homepage_left__text">
              {t("pages.main.title")}
              <span>{t("pages.main.subtitle")}</span>
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
                    {t("other.words.season")} 3
                    <span>
                      {t("other.words.endsIn")}: {""}
                      <span>{t("other.words.leftDays", { days: 14 })}</span>
                    </span>
                  </div>
                </div>
                <div className="homepage_left__stats__playeronline">
                  <TeamOutlined />
                  <div>
                    {t("other.words.lastHour")}
                    <span>
                      {t("other.words.playersOnline")} : 
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
};

export default withRouter(translate(Main));
