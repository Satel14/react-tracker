import React from "react";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";

const ErrorPage = () => {
  const navigate = useNavigate();
  return (
    <div className="content errorpage">
      404 ERROR
      <div>
        This page doesn&apos;t exist.
      </div>
      <Button type="primary" onClick={() => navigate("/")}>
        Повернуться на головну
      </Button>
    </div>
  );
};


export default ErrorPage;
