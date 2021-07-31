import React from 'react';
import {Button} from 'antd';

const getMainPage = (props) => {
    const {history} = props;
    if (history){
        history.push("/")
    }
};

const ErrorPage = (props) => {
    <div className="errorpage">
        <Button type="primary" onClick={() => getMainPage(props)}>
            Вернутся на главную
        </Button>
    </div>
};


export default ErrorPage;