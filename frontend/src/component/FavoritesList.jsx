import React, { Component } from 'react'
import { getFavorites } from '../cookie/store'
import { Fade } from 'react-reveal/Fade';
import { Button, Popconfirm } from 'antd'
import { DeleteOutlined, UserDeleteOutlined } from '@ant-design/icons'
import { translate } from 'react-switch-lang'
export class FavoritesList extends Component {
  constructor(props) {
    super(props)
    this.state = {
      favoritesList: null,
      deleteOn: false,
      updatingList: false,
    }
  }

  async componentDidMount() {
    const item = await getFavorites()

    if (item !== 0 && Object.keys(item > 0)) {
      this.setState({
        favoritesList: item,
      })
    }
  }

  async cleanFavorites() {
    this.setState({
      favoritesList: null,
    })
  }
  render() {
    const { favoritesList, deleteOn } = this.state;
    if (!favoritesList) {
      return (
        <div className='can-add-favoritelist'>
          You can add player to favorite list.
        </div>
      )
    }

    const { t } = this.props;
    const text = "Are you sure to clean list?"

    return (
      <Fade>
        <div className='favorites-list'>
          <div className='playerpage-buttons'>
            <Button
              type='link'
              icon={<UserDeleteOutlined />}
              size="small"
              className={deleteOn ? "active" : ""}
              onClick={() => {
                this.setState({
                  deleteOn: !deleteOn,
                })
              }}
            >
              {t("other.words.deletePlayer")}
            </Button>
            <Popconfirm
              placeholder="bottomRight"
              title={text}
              onConfirm={() => this.cleanFavorites()}
              okText="Yes"
              cancelText="No"
              className='csgo-pop'
            >
              <Button type='link' icon={<DeleteOutlined />} size="small">
                {t("other.words.cleanList")}
              </Button>
            </Popconfirm>
          </div>
        </div>
      </Fade>
    )
  }
}

export default translate(FavoritesList);