import React from "react";
import {
  MailOutlined,
  InfoCircleOutlined,
  BugOutlined,
  DollarCircleOutlined,
  CompassOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { translate } from "react-switch-lang";
import { Menu } from "antd";

const componentRoutes = [
  "/bugreport",
];
class Footer extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      current: ''
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.location !== prevProps.location) {
      this.onRouteChanged();
    }
  }

  componentDidMount() {
    const url = window.location.pathname;

    if (componentRoutes.includes(url)) {
      this.setState({
        current: url.replace("/", ""),
      });
    }
  }

  onRouteChanged() {
    const url = this.props.location?.pathname;

    if (url) {
      if (!componentRoutes.includes(url)) {
        this.setState({
          current: "",
        });
      }
    }
  }
  handleClick = (e) => {
    this.setState({ current: e.key })
  }
  render() {
    const { t } = this.props;
    const { current } = this.state;
    return (
      <div className="footer">
        <div className="footer-text">
          {t("footer.text1")}
        </div>
        <b>
          {t("footer.text2")}
        </b>
        <div className="copyright">
          {t("footer.developed")}
          <a href="mailto:ostaplvov@gmail.com"
            title="Mail Ostap"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#fff" }}
          >
          </a>
        </div>
        <div className="footer-menu">
          <Menu
            onClick={this.handleClick}
            selectedKeys={[current]}
            mode="horizontal"
          >
            <Menu.Item className="bugreport">
              <Link to='/bugreport'>
                <BugOutlined />
              </Link>
            </Menu.Item>
          </Menu>
        </div>
      </div>
    );
  }
}

export default translate(Footer);
