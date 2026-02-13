import { notification } from "antd"

const openNotification = (type, title, description = "", placement = "bottomRight") => {
  notification[type]({
    message: title,
    className: "pubg-notification",
    description,
    placement
  })
}

export default openNotification
