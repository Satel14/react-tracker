const { body } = require("express-validator");

module.exports.getPlayerData = async(req,res) =>{
    try{
        const {platform,gameId} = req.body;

        return res.status(200).json({ status:200 , data: [] });
    }catch (e){
        return res.status(200).json({ status:200 , message: e.message });
    }
};

module.exports.validate = (method) => {
    switch(method){
        case "getPlayerData":{
            return [
                body("platform").exists.isString(),
                body("gameId").exists.isString(),
            ];
        }
default:
    break;
    }
};