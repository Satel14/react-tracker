import React from 'react'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'

class NavbarSecond1 extends React.Component{
    render(){
        return(
            <div className="navbarsecond">
                <div>
                    <LeftOutlined/> Back
                </div>
                <div>
                   Next <RightOutlined/>
                </div>
            </div>
        );
    }
}
export default NavbarSecond1;