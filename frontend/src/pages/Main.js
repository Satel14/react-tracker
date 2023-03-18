import React, { useState } from "react";
import {
  EnterOutlined,
  FieldTimeOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import CountUp from "react-countup";
import { Row, Col, Radio, Input } from "antd";
import { translate } from "react-switch-lang";
import { Fade } from "react-reveal/Fade";
import { withRouter } from "react-router";
const Main = (props) => {
  const [platform, setPlatform] = useState("steam");
  const [text, setText] = useState("");
  const { t } = props;

  function handleClick() {
    const url = "/" + platform + "/" + text;
    console.log(url);
    props.history.push(url);
  }
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
            <Input
              size="large"
              placeholder="Enter name, id or url"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPressEnter={() => this.handleClick()}
            />
            <div className="enter-search" onClick={() => this.handleClick()}>
              <EnterOutlined />
            </div>

            <div className="homepage_left__stats">
              <div className="homepage_left__stats__seasonend">
                <FieldTimeOutlined />
                <div>
                  {t("other.words.season")}
                  <span>
                    {t("other.words.endsIn")}: {""}
                    <span>{t("other.words.leftDays", { days: 14 })}</span>
                  </span>
                </div>
              </div>
              <div className="homepage_left__stats__playeronline">
                <TeamOutlined />
                <div>
                  {t("other.words.playersOnline")}
                  <span>
                    {t("other.words.playersOnline")} :{" "}
                    <CountUp separator="," end={1133462} />
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
