import React, { useState } from "react";
import {
  EnterOutlined,
  FieldTimeOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import CountUp from "react-countup";
import { Row, Col, Input } from "antd";
import { translate } from "react-switch-lang";
import { motion } from "framer-motion";
import { withRouter } from "react-router";
import HistoryChecking from "../component/HistoryChecking";
import { getPlayerSteamName } from '../api/player'
import openNotification from '../component/Notification';
import SteamIcon from '../component/icons/SteamIcon';
import XboxIcon from '../component/icons/XboxIcon';
import PlaystationIcon from '../component/icons/PlaystaionIcon';
const Main = (props) => {
  const [platform, setPlatform] = useState("steam");
  const [text, setText] = useState("");
  const [exit, setExit] = useState(false)
  const [placeholder, setPlaceholder] = useState("Enter name, id or url")

  function isChecked(platformCheck) {
    if (platformCheck === platform) {
      return true;
    }
    return false
  }

  async function handleClick() {
    setExit(true);

    let steamName;

    if (text.search(/steamcommunity.com/) !== -1) {
      steamName = await getPlayerSteamName(text).then(({ data }) => {
        if (!data) {
          steamName = null;
        }
        return data;
      });
    }

    if (steamName === null) {
      openNotification("error", "SteamId Error", "Такого аккаунта нет");
      return;
    }

    let url;

    if (steamName) {
      url = "/player/" + platform + "/" + steamName;
    } else {
      url = "/player/" + platform + "/" + text;
    }

    setTimeout(() => {
      props.history.push(url);
    }, 600);
  }
  const { t } = props;


  return (
    <div className={exit ? "content mainpage exit" : "content mainpage"}>
      <Row style={{ justifyContent: "center" }}>
        <Col span={15}>
          <div className="mainpage_left">
            <div className="mainpage_left__text">
              {t("pages.main.title")}
              <span>{t("pages.main.subtitle")}</span>
            </div>
            <div className="chooser">
              <div className="choose-platform">
                <div className={isChecked("steam") ? "active" : ""}
                  onClick={() => {
                    setPlatform("steam")
                    setPlaceholder("Enter Steam name, ID or url")
                  }}
                >
                  <SteamIcon />
                </div>
                <div className={isChecked("xbox") ? "active" : ""}
                  onClick={() => {
                    setPlatform("xbox");
                    setPlaceholder("Enter Xbox Username")
                  }}
                >
                  <XboxIcon />
                </div>
                <div className={isChecked("psn") ? "active" : ""}
                  onClick={() => {
                    setPlatform("psn");
                    setPlaceholder("Enter Playstation Network Username")
                  }}
                >
                  <PlaystationIcon />
                </div>
              </div>
              <Input
                size="large"
                placeholder={placeholder}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPressEnter={() => handleClick()}
              />
              <div className="enter-search" onClick={() => handleClick()}>
                <EnterOutlined />
              </div>
            </div>

            <div className="mainpage_left__stats">
              <motion.div
                className="mainpage_left__stats__seasonend"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <FieldTimeOutlined />
                <div>
                  {t("other.words.season")}
                  <span>
                    {t("other.words.endsIn")}: {""}
                    <span>{t("other.words.leftDays", { days: 14 })}</span>
                  </span>
                </div>
              </motion.div>
              <div className="mainpage_left__stats__playeronline">
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
            <div className="history-list">
              <div>
                <HistoryChecking />
              </div>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default withRouter(translate(Main));
