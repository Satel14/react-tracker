import React from "react";
import { Button } from "antd";

const getMainPage = (props) => {
  const { history } = props;
  if (history) {
    history.push("/");
  }
};

const ErrorPage = (props) => {
  return (
    <div className="content errorpage">
      404 ERROR
      <div>
        This page doesn't exist.
      </div>
      <Button type="primary" onClick={() => getMainPage(props)}>
        Повернуться на головну
      </Button>
    </div>
  );
};


export default ErrorPage;
