// import React, { Component } from "react";
// import ErrorPage from "../pages/ErrorPage";
// import { BrowserRouter, Route, Switch } from "react-router-dom";
// import routes from "./routes";
// import App from "../App";


// class RouterLayout extends Component {
//   render() {
//     return (
//       <BrowserRouter>
//         <App>
//           <Switch>
//             {routes.map((route, index) => (
//               <Route
//                 key={index}
//                 path={route.path}
//                 exact={route.exact}
//                 component={(props) => ( 
//                   //eslint-disable-next-line react/jsx-props-no-spreading 
//                 <route.component {...props} />
//                 )}
//               />
//             ))}
//             <Route component={ErrorPage} />
//           </Switch>
//         </App>
//       </BrowserRouter>
//     );
//   }
// }

// export default RouterLayout;
