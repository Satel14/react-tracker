import React, { Component } from 'react'

export class FavoriteList extends Component {
  constructor(props) {
    super(props)
    this.props = {
      favoriteList: null,
      deleteOn: false,
      updatingList: false,
    }
  }
  render() {
    return (
      <div className='can-add-favoritelist'>
        You can add player to favorite list.
      </div>
    )
  }
}

export default FavoriteList