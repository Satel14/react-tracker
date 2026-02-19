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
import KakaoIcon from "../component/icons/KakaoIcon";
import StadiaIcon from "../component/icons/StadiaIcon";

const PLATFORM_OPTIONS = [
  {
    value: "steam",
    label: "Steam",
    placeholder: "Enter Steam name, ID or url",
    icon: <SteamIcon />,
  },
  {
    value: "xbox",
    label: "Xbox",
    placeholder: "Enter Xbox Gamertag",
    icon: <XboxIcon />,
  },
  {
    value: "psn",
    label: "PSN",
    placeholder: "Enter PlayStation Network ID",
    icon: <PlaystationIcon />,
  },
  {
    value: "stadia",
    label: "Stadia",
    placeholder: "Enter Stadia nickname",
    icon: <StadiaIcon />,
  },
  {
    value: "kakao",
    label: "Kakao",
    placeholder: "Enter Kakao nickname",
    icon: <KakaoIcon />,
  },
];

const PLATFORM_LOOKUP = PLATFORM_OPTIONS.reduce((accumulator, item) => {
  accumulator[item.value] = item;
  return accumulator;
}, {});

const Main = ({ t }) => {
  const [platform, setPlatform] = useState("steam");
  const [text, setText] = useState("");
  const [exit, setExit] = useState(false)
  const [liveStats, setLiveStats] = useState(null);
  const navigate = useNavigate();
  const placeholder = PLATFORM_LOOKUP?.[platform]?.placeholder || "Enter name, id or url";

  function isChecked(platformCheck) {
    if (platformCheck === platform) {
      return true;
    }
    return false
  }

  function handlePlatformChange(nextPlatform) {
    setPlatform(nextPlatform);
  }

  async function handleClick() {
    setExit(true);

    let steamName;

    if (platform === "steam" && text.search(/steamcommunity.com/) !== -1) {
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
        <Col xs={24} sm={22} md={18} lg={15}>
          <div className="mainpage_left">
            <div className="mainpage_left__text">
              {t("pages.main.title")}
              <span>{t("pages.main.subtitle")}</span>
            </div>
            <div className="chooser">
              <div className="choose-platform">
                {PLATFORM_OPTIONS.map((item) => (
                  <div
                    key={item.value}
                    className={isChecked(item.value) ? "active" : ""}
                    onClick={() => handlePlatformChange(item.value)}
                    title={item.label}
                  >
                    {item.icon}
                  </div>
                ))}
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
