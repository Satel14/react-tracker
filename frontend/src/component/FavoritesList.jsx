import React, { useState, useEffect } from 'react';
import { getFavorites } from '../cookie/store';
import { motion } from "framer-motion";
import { Button, Popconfirm } from 'antd';
import { DeleteOutlined, UserDeleteOutlined } from '@ant-design/icons';
import { translate } from 'react-switch-lang';

const FavoritesList = ({ t }) => {
  const [favoritesList, setFavoritesList] = useState(null);
  const [deleteOn, setDeleteOn] = useState(false);

  useEffect(() => {
    const fetchFavorites = async () => {
      const item = await getFavorites();
      if (item && Object.keys(item).length > 0) {
        setFavoritesList(item);
      }
    };
    fetchFavorites();
  }, []);

  const cleanFavorites = () => {
    setFavoritesList(null);
  };

  if (!favoritesList) {
    return (
      <div className='can-add-favoritelist'>
        You can add player to favorite list.
      </div>
    );
  }

  const text = "Are you sure to clean list?";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className='favorites-list'>
        <div className='playerpage-buttons'>
          <Button
            type='link'
            icon={<UserDeleteOutlined />}
            size="small"
            className={deleteOn ? "active" : ""}
            onClick={() => setDeleteOn(!deleteOn)}
          >
            {t("other.words.deletePlayer")}
          </Button>
          <Popconfirm
            placement="bottomRight"
            title={text}
            onConfirm={cleanFavorites}
            okText="Yes"
            cancelText="No"
            className='pubg-pop'
          >
            <Button type='link' icon={<DeleteOutlined />} size="small">
              {t("other.words.cleanList")}
            </Button>
          </Popconfirm>
        </div>
      </div>
    </motion.div>
  );
};

export default translate(FavoritesList);
