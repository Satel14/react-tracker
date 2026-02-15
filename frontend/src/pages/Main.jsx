import React, { useState, useEffect } from "react";
import {
  EnterOutlined,
  FieldTimeOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import CountUp from "react-countup";
import { Row, Col, Input } from "antd";
import { translate } from "react-switch-lang";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import HistoryChecking from "../component/HistoryChecking";
import { getLiveSnapshot, getPlayerSteamName } from '../api/player'
import openNotification from '../component/Notification';
import SteamIcon from '../component/icons/SteamIcon';
import XboxIcon from '../component/icons/XboxIcon';
import PlaystationIcon from '../component/icons/PlaystaionIcon';
const Main = ({ t }) => {
  const [platform, setPlatform] = useState("steam");
  const [text, setText] = useState("");
  const [exit, setExit] = useState(false)
  const [placeholder, setPlaceholder] = useState("Enter name, id or url")
  const [liveStats, setLiveStats] = useState(null);
  const navigate = useNavigate();

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
      navigate(url);
    }, 600);
  }

  useEffect(() => {
    let isMounted = true;

    const fetchLiveData = async () => {
      try {
        const response = await getLiveSnapshot();
        const payload = response?.data?.data || response?.data || null;
        if (isMounted && payload) {
          setLiveStats(payload);
        }
      } catch (_e) {
        // keep fallback UI values if request fails
      }
    };

    fetchLiveData();
    const intervalId = setInterval(fetchLiveData, 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const seasonLabel = liveStats?.season?.label || t("other.words.season");
  const endsInDays = liveStats?.season?.endsInDays;
  const playersOnlineValue = Number(liveStats?.playersOnline?.value);
  const hasPlayersOnline = Number.isFinite(playersOnlineValue);
  const hasSeasonCountdown = Number.isFinite(Number(endsInDays));
  const isEstimatedSeasonCountdown = Boolean(liveStats?.season?.isEstimated);



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
                  {seasonLabel}
                  <span>
                    {t("other.words.endsIn")}: {""}
                    <span>
                      {hasSeasonCountdown
                        ? `${isEstimatedSeasonCountdown ? "~ " : ""}${t("other.words.leftDays", { days: Number(endsInDays) })}`
                        : t("other.words.notAvailable")}
                    </span>
                  </span>
                </div>
              </motion.div>
              <div className="mainpage_left__stats__playeronline">
                <TeamOutlined />
                <div>
                  {t("other.words.playersOnline")}
                  <span>
                    {t("other.words.playersOnline")} :{" "}
                    {hasPlayersOnline ? (
                      <CountUp separator="," end={playersOnlineValue} />
                    ) : (
                      t("other.words.notAvailable")
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="history-list">
              <HistoryChecking />
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default translate(Main);
