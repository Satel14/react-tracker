import React, { useState } from "react"; 
import { Button } from "antd";
 import { translate } from "react-switch-lang"; 

 const CookieRule = (props) => { 
     const [show, setShow] = useState(true); 
     const { t } = props; const toggle = () => { 
         setShow(!show); 
         localStorage.setItem("cookierulebro", 1); 
        }; 
        const cookiesogl = localStorage.getItem("cookierulebro");
         return ( 
         <> {cookiesogl == null && show &&( 
         <div className="site-cookie">
              <div className="site-cookie-block">
                  <div>
                      {t("other.coolie.text")}</div>
                      <Button type="primary" onClick={toggle}>
                          {t("other.cookie.accept")}
                      </Button>
              </div>
              </div>
         )}
         </>
         );
 };


 export default translate(CookieRule);