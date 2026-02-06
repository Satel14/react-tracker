import React, { useState, useEffect } from 'react';
import { getHistory } from './../cookie/store';
import { motion } from "framer-motion";
import { translate } from "react-switch-lang";
import { getPlatformAvatar, getIconComponentPlatfrom } from '../helpers/other'
import { Link } from 'react-router-dom'

const HistoryChecking = ({ t }) => {
  const [historyList, setHistoryList] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      const items = await getHistory();
      if (items !== null && Object.keys(items).length > 0) {
        setHistoryList(items);
      }
    };
    fetchHistory();
  }, []);

  if (!historyList) {
    return <></>;
  }

  const renderHistoryList = () => {
    const renderList = [];

    for (let key in historyList) {
      let gameId = key;
      let player = historyList[gameId];

      if (!player.avatar) {
        player.avatar = getPlatformAvatar(player.platform);
      }

      renderList.push(
        <Link
          to={"/player/" + player.platform + "/" + gameId}
          className="historycheck_block"
          key={player.platform + gameId}
        >
          <div className='historycheck_block-left'>
            <img src={player.image} alt={player.nickname} />
            <div className='nickname'>
              {player.nickname}
              <span>{t("other.words.viewStats")}</span>
            </div>
          </div>

          <div className='historycheck_block-platform'>
            {getIconComponentPlatfrom(player.platform)}
          </div>
          <div className='istorycheck_block-mmr'>
            {t("other.words.rating")}
            <span>{player.rating}</span>
          </div>
        </Link>
      );
    }
    return renderList;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <div className='titlehistory'>{t("page.main.searchingHistory")}</div>
      <div className='historycheck'>{renderHistoryList()}</div>
    </motion.div>
  );
};

export default translate(HistoryChecking);
